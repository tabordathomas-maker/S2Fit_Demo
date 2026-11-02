"""Rutinas personalizadas: estados de los pasos, avance, estadísticas y reglas de acceso."""

import uuid
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core import clock
from app.core.config import get_settings
from app.core.errors import AppError, conflict, not_found
from app.models import CustomRoutine, Profile, RoutineStep, RoutineStepCompletion, Subscription
from app.models.enums import RoutineStatus
from app.schemas.routines import CompleteStep
from app.services.subscriptions import has_active_membership

WEEKS = 8
PLUS_REQUIRED_MESSAGE = "Tu rutina personalizada es parte de S2 Plus. Renueva tu membresía para continuar."


def plus_required() -> AppError:
    return AppError(403, "plus_required", PLUS_REQUIRED_MESSAGE)


def _percent(done: int, total: int) -> int:
    return round(done * 100 / total) if total else 0


def _local_date(moment: datetime) -> date:
    return moment.astimezone(ZoneInfo(get_settings().app_timezone)).date()


def routine_query():
    return select(CustomRoutine).options(selectinload(CustomRoutine.steps).selectinload(RoutineStep.completions))


def load_routine(db: Session, routine_id: int) -> CustomRoutine:
    # populate_existing: la sesión no expira al confirmar, así que se refrescan pasos y avances ya cargados.
    routine = db.scalars(
        routine_query().where(CustomRoutine.id == routine_id).execution_options(populate_existing=True)
    ).first()
    if routine is None:
        raise not_found("Rutina no encontrada.")
    return routine


def get_user_routine(db: Session, user: Profile, routine_id: int) -> CustomRoutine:
    """Rutina propia y visible. Las ajenas y los borradores responden 404."""
    routine = db.scalars(
        routine_query().where(
            CustomRoutine.id == routine_id,
            CustomRoutine.user_id == user.id,
            CustomRoutine.status != RoutineStatus.draft,
        )
    ).first()
    if routine is None:
        raise not_found("Rutina no encontrada.")
    return routine


def list_user_routines(db: Session, user: Profile) -> list[CustomRoutine]:
    return list(
        db.scalars(
            routine_query()
            .where(CustomRoutine.user_id == user.id, CustomRoutine.status != RoutineStatus.draft)
            .order_by(
                (CustomRoutine.status != RoutineStatus.active), CustomRoutine.created_at.desc(), CustomRoutine.id.desc()
            )
        )
    )


def user_has_plus(db: Session, user_id: uuid.UUID) -> bool:
    return has_active_membership(db, user_id, clock.now())


def require_plus(db: Session, user: Profile) -> None:
    if not user_has_plus(db, user.id):
        raise plus_required()


def plus_until(db: Session, user_id: uuid.UUID) -> datetime | None:
    """Fecha de fin de la membresía, solo para mostrar (el acceso lo decide has_active_membership)."""
    return db.scalar(select(Subscription.ends_at).where(Subscription.user_id == user_id))


def _completion_of(step: RoutineStep):
    return step.completions[0] if step.completions else None


def step_states(routine: CustomRoutine) -> dict[int, str]:
    states: dict[int, str] = {}
    current_found = False
    for step in routine.steps:
        if _completion_of(step) is not None:
            states[step.id] = "done"
        elif not routine.sequential:
            states[step.id] = "available"
        elif not current_found:
            states[step.id] = "current"
            current_found = True
        else:
            states[step.id] = "locked"
    return states


def progress(routine: CustomRoutine) -> tuple[int, int, int]:
    """(completados, total, porcentaje)."""
    total = len(routine.steps)
    done = sum(1 for s in routine.steps if _completion_of(s) is not None)
    return done, total, _percent(done, total)


def _step_minutes(step: RoutineStep) -> int:
    completion = _completion_of(step)
    return (completion.minutes or step.duration_minutes or 0) if completion else 0


def _streak(days: set[date], today: date) -> int:
    day = today if today in days else today - timedelta(days=1)
    count = 0
    while day in days:
        count += 1
        day -= timedelta(days=1)
    return count


def stats(routine: CustomRoutine, today: date | None = None) -> dict:
    today = today or clock.local_today()
    done, total, pct = progress(routine)
    completed = [(s, _completion_of(s)) for s in routine.steps if _completion_of(s) is not None]
    efforts = [c.effort for _, c in completed if c.effort is not None]
    days = {_local_date(c.completed_at) for _, c in completed}

    this_week = today - timedelta(days=today.weekday())
    weekly = []
    for offset in range(WEEKS - 1, -1, -1):
        start = this_week - timedelta(weeks=offset)
        in_week = [(s, c) for s, c in completed if start <= _local_date(c.completed_at) < start + timedelta(days=7)]
        weekly.append(
            {"week_start": start, "completions": len(in_week), "minutes": sum(_step_minutes(s) for s, _ in in_week)}
        )

    states = step_states(routine)
    next_step = next((s for s in routine.steps if states[s.id] in ("current", "available")), None)
    return {
        "progress_pct": pct,
        "completed_steps": done,
        "total_steps": total,
        "total_minutes": sum(_step_minutes(s) for s, _ in completed),
        "avg_effort": round(sum(efforts) / len(efforts), 1) if efforts else None,
        "current_streak_days": _streak(days, today),
        "last_completed_at": max((c.completed_at for _, c in completed), default=None),
        "next_step": {"id": next_step.id, "title": next_step.title} if next_step else None,
        "weekly": weekly,
    }


def detail(routine: CustomRoutine) -> dict:
    states = step_states(routine)
    return {
        "id": routine.id,
        "title": routine.title,
        "description": routine.description,
        "goal": routine.goal,
        "status": routine.status,
        "sequential": routine.sequential,
        "locked": False,
        "steps": [
            {
                "id": s.id,
                "position": s.position,
                "title": s.title,
                "block_label": s.block_label,
                "sets_reps": s.sets_reps,
                "duration_minutes": s.duration_minutes,
                "instructions": s.instructions,
                "media_url": s.media_url,
                "cover_url": s.cover_url,
                "state": states[s.id],
                "completion": _completion_of(s),
            }
            for s in routine.steps
        ],
        "stats": stats(routine),
    }


def summary(routine: CustomRoutine, locked: bool) -> dict:
    done, total, pct = progress(routine)
    return {
        "id": routine.id,
        "title": routine.title,
        "goal": routine.goal,
        "status": routine.status,
        "locked": locked,
        "progress_pct": pct,
        "completed_steps": done,
        "total_steps": total,
        "stats": None if locked else stats(routine),
    }


def _step_of(routine: CustomRoutine, step_id: int) -> RoutineStep:
    step = next((s for s in routine.steps if s.id == step_id), None)
    if step is None:
        raise not_found("Paso no encontrado.")
    return step


def complete_step(db: Session, user: Profile, routine: CustomRoutine, step_id: int, data: CompleteStep) -> None:
    if routine.status != RoutineStatus.active:
        raise conflict("routine_archived", "Esta rutina está archivada y ya no admite cambios.")
    step = _step_of(routine, step_id)
    state = step_states(routine)[step.id]
    if state == "done":
        return  # Idempotente: completar dos veces no duplica.
    if state == "locked":
        raise conflict("step_locked", "Completa primero el paso anterior.")
    # Se agrega por la relación para que la rutina en memoria quede al día (la sesión no expira al confirmar).
    step.completions.append(
        RoutineStepCompletion(
            user_id=user.id,
            completed_at=clock.now(),
            minutes=data.minutes,
            effort=data.effort,
            note=data.note or None,
        )
    )
    db.flush()


def undo_step(db: Session, routine: CustomRoutine, step_id: int) -> None:
    if routine.status != RoutineStatus.active:
        raise conflict("routine_archived", "Esta rutina está archivada y ya no admite cambios.")
    step = _step_of(routine, step_id)
    step.completions.clear()  # delete-orphan borra las filas al vaciar la relación
    db.flush()


# ---- Administración ----


def renumber(db: Session, routine_id: int, ordered_ids: list[int]) -> None:
    """Asigna posiciones 1..n. La restricción única es diferida, así que el orden de los UPDATE no importa."""
    steps = {s.id: s for s in db.scalars(select(RoutineStep).where(RoutineStep.routine_id == routine_id))}
    for position, step_id in enumerate(ordered_ids, start=1):
        steps[step_id].position = position
    db.flush()


def validate_activation(routine: CustomRoutine) -> None:
    if not routine.steps:
        raise AppError(422, "routine_empty", "Agrega al menos un paso antes de activar la rutina.")
