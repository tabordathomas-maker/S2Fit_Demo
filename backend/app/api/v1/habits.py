from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUser, DbSession
from app.core import clock
from app.schemas.wellness import HabitCreate, HabitLogSet, HabitSummary
from app.services import habits

router = APIRouter(prefix="/habits", tags=["hábitos"])


@router.get("", response_model=HabitSummary)
def get_habits(user: CurrentUser, db: DbSession, day: Annotated[date | None, Query(alias="date")] = None):
    today = clock.local_today()
    return habits.summary(db, user, day or today, today)


@router.post("", response_model=HabitSummary, status_code=status.HTTP_201_CREATED)
def create_habit(data: HabitCreate, user: CurrentUser, db: DbSession):
    habits.create_habit(db, user, data.name)
    db.commit()
    today = clock.local_today()
    return habits.summary(db, user, today, today)


@router.put("/{habit_id}/log", response_model=HabitSummary)
def set_habit_log(habit_id: int, data: HabitLogSet, user: CurrentUser, db: DbSession):
    today = clock.local_today()
    habits.set_log(db, user, habit_id, data.date, data.completed, today)
    db.commit()
    return habits.summary(db, user, data.date, today)


@router.delete("/{habit_id}", response_model=HabitSummary)
def remove_habit(habit_id: int, user: CurrentUser, db: DbSession):
    habits.deactivate_habit(db, user, habit_id)
    db.commit()
    today = clock.local_today()
    return habits.summary(db, user, today, today)
