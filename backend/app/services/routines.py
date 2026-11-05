"""Rutinas personalizadas: estados de los pasos, avance, estadísticas y reglas de acceso (Mi Ruta es gratis: basta con tener sesión)."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core import clock
from app.core.config import get_settings
from app.core.errors import AppError, conflict, not_found
from app.models import CustomRoutine, Profile, RoutineStep, RoutineStepCompletion
from app.models.enums import RoutineStatus
from app.schemas.routines import CompleteStep
from app.services import archive, audit

WEEKS = 8

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


def summary(routine: CustomRoutine) -> dict:
    done, total, pct = progress(routine)
    return {
        "id": routine.id,
        "title": routine.title,
        "goal": routine.goal,
        "status": routine.status,
        "progress_pct": pct,
        "completed_steps": done,
        "total_steps": total,
        "stats": stats(routine),
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


def completions_count(db: Session, routine_id: int) -> int:
    return db.scalar(
        select(func.count(RoutineStepCompletion.id))
        .join(RoutineStep, RoutineStep.id == RoutineStepCompletion.step_id)
        .where(RoutineStep.routine_id == routine_id)
    ) or 0


def admin_update(db: Session, admin: Profile, routine: CustomRoutine, changes: dict) -> None:
    """PATCH parcial de una rutina: título, descripción, objetivo, estado, secuencia y persona asignada."""
    for key in ("title", "sequential", "status"):
        if key in changes and changes[key] is None:
            changes.pop(key)
    new_user_id = changes.pop("user_id", None)
    if changes.get("status") == RoutineStatus.active:
        validate_activation(routine)
    reassigned = None
    if new_user_id is not None and new_user_id != routine.user_id:
        if db.get(Profile, new_user_id) is None:
            raise not_found("Usuario no encontrado.")
        done = completions_count(db, routine.id)
        archive.block_if_referenced(
            f"Esta rutina ya tiene {archive.plural(done, 'avance registrado', 'avances registrados')} de su dueña actual. "
            "No se puede reasignar: archívala y crea una nueva para la otra persona.",
            {"completions": done},
        )
        reassigned = {"from": str(routine.user_id), "to": str(new_user_id)}
        routine.user_id = new_user_id
    real = archive.apply_update(db, admin, routine, "routine", routine.id, changes)
    if reassigned:
        audit.record(db, admin, "routine.reassign", "routine", routine.id, reassigned)
    elif not real:
        return


def archive_routine(db: Session, admin: Profile, routine: CustomRoutine) -> None:
    routine.status = RoutineStatus.archived
    audit.record(db, admin, "routine.archive", "routine", routine.id, {})


def restore_routine(db: Session, admin: Profile, routine: CustomRoutine) -> None:
    routine.status = RoutineStatus.active if routine.steps else RoutineStatus.draft
    audit.record(db, admin, "routine.restore", "routine", routine.id, {"status": routine.status})


def delete_routine(db: Session, admin: Profile, routine_id: int) -> None:
    routine = load_routine(db, routine_id)
    done = completions_count(db, routine.id)
    archive.block_if_referenced(
        f"Esta rutina tiene {archive.plural(done, 'avance registrado', 'avances registrados')}. "
        "Puedes archivarla para conservar el historial.",
        {"completions": done},
    )
    audit.record(db, admin, "routine.delete", "routine", routine.id,
                 {"title": routine.title, "user_id": str(routine.user_id), "steps": len(routine.steps)})
    db.delete(routine)  # sus pasos se borran en cascada
