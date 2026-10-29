from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.errors import AppError, conflict, not_found
from app.models import HabitLog, Profile, UserHabit

DEFAULT_HABITS = ["Entrenar hoy", "Tomar suficiente agua", "Dormir 7 horas", "Comer balanceado", "Momento de autocuidado"]
EDITABLE_DAYS = 7
HISTORY_DAYS = 14
MAX_HABITS = 12


def _percent(done: int, total: int) -> int:
    return round(done * 100 / total) if total else 0


def ensure_default_habits(db: Session, user: Profile) -> None:
    if db.scalar(select(func.count()).select_from(UserHabit).where(UserHabit.user_id == user.id)):
        return
    db.execute(
        insert(UserHabit)
        .values([{"user_id": user.id, "name": name, "sort_order": i} for i, name in enumerate(DEFAULT_HABITS)])
        .on_conflict_do_nothing()
    )
    db.commit()


def _active_habits(db: Session, user: Profile) -> list[UserHabit]:
    return list(
        db.scalars(
            select(UserHabit)
            .where(UserHabit.user_id == user.id, UserHabit.is_active.is_(True))
            .order_by(UserHabit.sort_order, UserHabit.id)
        )
    )


def _completed_by_day(db: Session, user: Profile, habit_ids: list[int], start: date, end: date) -> dict[date, set[int]]:
    rows = db.execute(
        select(HabitLog.log_date, HabitLog.habit_id).where(
            HabitLog.user_id == user.id,
            HabitLog.habit_id.in_(habit_ids),
            HabitLog.completed.is_(True),
            HabitLog.log_date.between(start, end),
        )
    )
    result: dict[date, set[int]] = {}
    for log_date, habit_id in rows:
        result.setdefault(log_date, set()).add(habit_id)
    return result


def summary(db: Session, user: Profile, day: date, today: date) -> dict:
    ensure_default_habits(db, user)
    habits = _active_habits(db, user)
    ids = [h.id for h in habits]
    total = len(habits)
    history_start = today - timedelta(days=HISTORY_DAYS - 1)
    done = _completed_by_day(db, user, ids, min(history_start, day), max(today, day))

    day_done = done.get(day, set())
    history = []
    for offset in range(HISTORY_DAYS):
        d = today - timedelta(days=offset)
        count = len(done.get(d, set()))
        history.append({"date": d, "completed": count, "total": total, "percent": _percent(count, total)})
    week_done = sum(len(done.get(today - timedelta(days=o), set())) for o in range(7))

    return {
        "today": {
            "date": day,
            "habits": [{"id": h.id, "name": h.name, "completed": h.id in day_done} for h in habits],
            "completed": len(day_done),
            "total": total,
            "percent": _percent(len(day_done), total),
        },
        "history": history,
        "weekly_percent": _percent(week_done, total * 7),
    }


def weekly_percent(db: Session, user: Profile, today: date) -> int:
    habits = _active_habits(db, user)
    if not habits:
        return 0
    done = _completed_by_day(db, user, [h.id for h in habits], today - timedelta(days=6), today)
    return _percent(sum(len(v) for v in done.values()), len(habits) * 7)


def set_log(db: Session, user: Profile, habit_id: int, log_date: date, completed: bool, today: date) -> None:
    habit = db.get(UserHabit, habit_id)
    # 404 tanto si no existe como si es de otra persona.
    if habit is None or habit.user_id != user.id or not habit.is_active:
        raise not_found("El hábito no existe.")
    if log_date > today or log_date < today - timedelta(days=EDITABLE_DAYS - 1):
        raise AppError(422, "date_out_of_range", f"Solo puedes registrar hábitos de los últimos {EDITABLE_DAYS} días.")
    db.execute(
        insert(HabitLog)
        .values(habit_id=habit.id, user_id=user.id, log_date=log_date, completed=completed)
        .on_conflict_do_update(
            constraint="uq_habit_logs_habit_date", set_={"completed": completed, "updated_at": func.now()}
        )
    )


def create_habit(db: Session, user: Profile, name: str) -> UserHabit:
    ensure_default_habits(db, user)
    existing = db.scalars(select(UserHabit).where(UserHabit.user_id == user.id, UserHabit.name == name)).one_or_none()
    if existing is not None:
        if existing.is_active:
            raise conflict("habit_exists", "Ya tienes un hábito con ese nombre.")
        existing.is_active = True
        return existing
    if len(_active_habits(db, user)) >= MAX_HABITS:
        raise conflict("habit_limit", f"Puedes tener máximo {MAX_HABITS} hábitos activos.")
    habit = UserHabit(user_id=user.id, name=name, sort_order=100)
    db.add(habit)
    db.flush()
    return habit


def deactivate_habit(db: Session, user: Profile, habit_id: int) -> None:
    habit = db.get(UserHabit, habit_id)
    if habit is None or habit.user_id != user.id:
        raise not_found("El hábito no existe.")
    habit.is_active = False
