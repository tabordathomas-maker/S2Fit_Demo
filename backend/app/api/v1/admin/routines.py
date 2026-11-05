import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import func, select

from app.api.deps import AdminUser, DbSession
from app.core.errors import AppError, not_found
from app.models import CustomRoutine, Profile, RoutineStep
from app.models.enums import RoutineStatus
from app.schemas.routines import (
    AdminRoutineDetail,
    AdminRoutineOut,
    RoutineCreate,
    RoutineDetail,
    RoutineUpdate,
    StepCreate,
    StepOrder,
    StepUpdate,
)
from app.services import audit, routines

router = APIRouter(tags=["admin: rutinas personalizadas"])

AdminStepFields = ("title", "instructions", "block_label", "media_url", "cover_url", "duration_minutes", "sets_reps")


def _out(routine: CustomRoutine, owner: Profile) -> dict:
    _, _, pct = routines.progress(routine)
    return {
        "id": routine.id,
        "user_id": routine.user_id,
        "user_email": owner.email,
        "user_name": owner.full_name,
        "title": routine.title,
        "description": routine.description,
        "goal": routine.goal,
        "status": routine.status,
        "sequential": routine.sequential,
        "step_count": len(routine.steps),
        "progress_pct": pct,
        "created_at": routine.created_at,
    }


def _detail(db, routine: CustomRoutine) -> dict:
    owner = db.get(Profile, routine.user_id)
    return {**_out(routine, owner), "steps": list(routine.steps)}


@router.get("/routines", response_model=list[AdminRoutineOut])
def list_routines(
    _: AdminUser,
    db: DbSession,
    user_id: uuid.UUID | None = None,
    status_: Annotated[RoutineStatus | None, Query(alias="status")] = None,
):
    stmt = routines.routine_query().order_by(CustomRoutine.created_at.desc(), CustomRoutine.id.desc())
    if user_id:
        stmt = stmt.where(CustomRoutine.user_id == user_id)
    if status_:
        stmt = stmt.where(CustomRoutine.status == status_)
    rows = list(db.scalars(stmt))
    owners = {p.id: p for p in db.scalars(select(Profile).where(Profile.id.in_({r.user_id for r in rows})))}
    return [_out(r, owners[r.user_id]) for r in rows]


@router.post("/routines", response_model=AdminRoutineDetail, status_code=status.HTTP_201_CREATED)
def create_routine(data: RoutineCreate, admin: AdminUser, db: DbSession):
    if db.get(Profile, data.user_id) is None:
        raise not_found("Usuario no encontrado.")
    routine = CustomRoutine(**data.model_dump(), created_by=admin.id)
    db.add(routine)
    db.flush()
    audit.record(db, admin, "routine.create", "routine", routine.id, {"user_id": str(data.user_id), "title": routine.title})
    db.commit()
    return _detail(db, routines.load_routine(db, routine.id))


@router.get("/routines/{routine_id}", response_model=AdminRoutineDetail)
def get_routine(routine_id: int, _: AdminUser, db: DbSession):
    return _detail(db, routines.load_routine(db, routine_id))


@router.patch("/routines/{routine_id}", response_model=AdminRoutineDetail)
def update_routine(routine_id: int, data: RoutineUpdate, admin: AdminUser, db: DbSession):
    routine = routines.load_routine(db, routine_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("title") is None:
        changes.pop("title", None)
    if changes.get("sequential") is None:
        changes.pop("sequential", None)
    if changes.get("status") is None:
        changes.pop("status", None)
    if changes.get("status") == RoutineStatus.active:
        routines.validate_activation(routine)
    for field, value in changes.items():
        setattr(routine, field, value)
    audit.record(db, admin, "routine.update", "routine", routine.id, {k: str(v) for k, v in changes.items()})
    db.commit()
    return _detail(db, routine)


@router.post("/routines/{routine_id}/steps", response_model=AdminRoutineDetail, status_code=status.HTTP_201_CREATED)
def add_step(routine_id: int, data: StepCreate, admin: AdminUser, db: DbSession):
    routine = routines.load_routine(db, routine_id)
    position = (db.scalar(select(func.max(RoutineStep.position)).where(RoutineStep.routine_id == routine.id)) or 0) + 1
    step = RoutineStep(routine_id=routine.id, position=position, **data.model_dump())
    db.add(step)
    db.flush()
    audit.record(db, admin, "routine_step.create", "routine_step", step.id, {"routine_id": routine.id, "title": step.title})
    db.commit()
    return _detail(db, routines.load_routine(db, routine.id))


def _load_step(db, step_id: int) -> RoutineStep:
    step = db.get(RoutineStep, step_id)
    if step is None:
        raise not_found("Paso no encontrado.")
    return step


@router.patch("/routine-steps/{step_id}", response_model=AdminRoutineDetail)
def update_step(step_id: int, data: StepUpdate, admin: AdminUser, db: DbSession):
    step = _load_step(db, step_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("title") is None:
        changes.pop("title", None)
    for field, value in changes.items():
        setattr(step, field, value)
    audit.record(db, admin, "routine_step.update", "routine_step", step.id, {"routine_id": step.routine_id, "fields": sorted(changes)})
    db.commit()
    return _detail(db, routines.load_routine(db, step.routine_id))


@router.delete("/routine-steps/{step_id}", response_model=AdminRoutineDetail)
def delete_step(step_id: int, admin: AdminUser, db: DbSession):
    step = _load_step(db, step_id)
    routine_id = step.routine_id
    db.delete(step)  # sus avances se borran en cascada
    db.flush()
    remaining = list(db.scalars(select(RoutineStep.id).where(RoutineStep.routine_id == routine_id).order_by(RoutineStep.position)))
    routines.renumber(db, routine_id, remaining)
    audit.record(db, admin, "routine_step.delete", "routine_step", step_id, {"routine_id": routine_id})
    db.commit()
    return _detail(db, routines.load_routine(db, routine_id))


@router.put("/routines/{routine_id}/steps/order", response_model=AdminRoutineDetail)
def reorder_steps(routine_id: int, data: StepOrder, admin: AdminUser, db: DbSession):
    routine = routines.load_routine(db, routine_id)
    current = {s.id for s in routine.steps}
    if len(data.step_ids) != len(set(data.step_ids)) or set(data.step_ids) != current:
        raise AppError(422, "invalid_order", "La lista debe contener exactamente los pasos de esta rutina.")
    routines.renumber(db, routine.id, data.step_ids)
    audit.record(db, admin, "routine_step.reorder", "routine", routine.id, {"order": data.step_ids})
    db.commit()
    db.expire(routine, ["steps"])
    return _detail(db, routines.load_routine(db, routine.id))


@router.get("/routines/{routine_id}/progress", response_model=RoutineDetail)
def routine_progress(routine_id: int, _: AdminUser, db: DbSession):
    """Lo que ve la persona: pasos, estados, avances y estadísticas."""
    return routines.detail(routines.load_routine(db, routine_id))
