from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.routines import CompleteStep, RoutineDetail, RoutineSummary
from app.services import routines

router = APIRouter(prefix="/routines", tags=["rutinas personalizadas"])


@router.get("", response_model=list[RoutineSummary])
def list_routines(user: CurrentUser, db: DbSession):
    return [routines.summary(r) for r in routines.list_user_routines(db, user)]


@router.get("/{routine_id}", response_model=RoutineDetail)
def get_routine(routine_id: int, user: CurrentUser, db: DbSession):
    routine = routines.get_user_routine(db, user, routine_id)
    return routines.detail(routine)


@router.post("/{routine_id}/steps/{step_id}/complete", response_model=RoutineDetail)
def complete_step(routine_id: int, step_id: int, user: CurrentUser, db: DbSession, data: CompleteStep | None = None):
    routine = routines.get_user_routine(db, user, routine_id)
    routines.complete_step(db, user, routine, step_id, data or CompleteStep())
    db.commit()
    return routines.detail(routine)


@router.delete("/{routine_id}/steps/{step_id}/complete", response_model=RoutineDetail)
def undo_step(routine_id: int, step_id: int, user: CurrentUser, db: DbSession):
    routine = routines.get_user_routine(db, user, routine_id)
    routines.undo_step(db, routine, step_id)
    db.commit()
    return routines.detail(routine)
