import uuid
from datetime import date, datetime

from pydantic import Field

from app.models.enums import RoutineStatus
from app.schemas.common import InputModel, ORMModel

HTTPS = r"^https://"


class CompletionOut(ORMModel):
    completed_at: datetime
    minutes: int | None
    effort: int | None
    note: str | None


class NextStep(ORMModel):
    id: int
    title: str


class WeeklyPoint(ORMModel):
    week_start: date
    completions: int
    minutes: int


class RoutineStats(ORMModel):
    progress_pct: int
    completed_steps: int
    total_steps: int
    total_minutes: int
    avg_effort: float | None
    current_streak_days: int
    last_completed_at: datetime | None
    next_step: NextStep | None
    weekly: list[WeeklyPoint]


class RoutineSummary(ORMModel):
    """Resumen para la lista."""

    id: int
    title: str
    goal: str | None
    status: str
    progress_pct: int
    completed_steps: int
    total_steps: int
    stats: RoutineStats | None = None


class StepOut(ORMModel):
    id: int
    position: int
    title: str
    block_label: str | None
    sets_reps: str | None
    duration_minutes: int | None
    instructions: str | None
    media_url: str | None
    cover_url: str | None
    state: str  # done | current | locked | available
    completion: CompletionOut | None


class RoutineDetail(ORMModel):
    id: int
    title: str
    description: str | None
    goal: str | None
    status: str
    sequential: bool
    steps: list[StepOut]
    stats: RoutineStats


class CompleteStep(InputModel):
    minutes: int | None = Field(default=None, ge=1, le=600)
    effort: int | None = Field(default=None, ge=1, le=5)
    note: str | None = Field(default=None, max_length=300)


# ---- Administración ----


class AdminStepOut(ORMModel):
    id: int
    position: int
    title: str
    instructions: str | None
    block_label: str | None
    media_url: str | None
    cover_url: str | None
    duration_minutes: int | None
    sets_reps: str | None


class AdminRoutineOut(ORMModel):
    id: int
    user_id: uuid.UUID
    user_email: str | None
    user_name: str | None
    title: str
    description: str | None
    goal: str | None
    status: str
    sequential: bool
    step_count: int
    progress_pct: int
    created_at: datetime


class AdminRoutineDetail(AdminRoutineOut):
    steps: list[AdminStepOut]


class RoutineCreate(InputModel):
    user_id: uuid.UUID
    title: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=5000)
    goal: str | None = Field(default=None, max_length=160)
    sequential: bool = True


class RoutineUpdate(InputModel):
    title: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=5000)
    goal: str | None = Field(default=None, max_length=160)
    status: RoutineStatus | None = None
    sequential: bool | None = None


class StepCreate(InputModel):
    title: str = Field(min_length=2, max_length=160)
    instructions: str | None = Field(default=None, max_length=10000)
    block_label: str | None = Field(default=None, max_length=80)
    media_url: str | None = Field(default=None, max_length=500, pattern=HTTPS)
    cover_url: str | None = Field(default=None, max_length=500, pattern=HTTPS)
    duration_minutes: int | None = Field(default=None, ge=1, le=600)
    sets_reps: str | None = Field(default=None, max_length=80)


class StepUpdate(InputModel):
    title: str | None = Field(default=None, min_length=2, max_length=160)
    instructions: str | None = Field(default=None, max_length=10000)
    block_label: str | None = Field(default=None, max_length=80)
    media_url: str | None = Field(default=None, max_length=500, pattern=HTTPS)
    cover_url: str | None = Field(default=None, max_length=500, pattern=HTTPS)
    duration_minutes: int | None = Field(default=None, ge=1, le=600)
    sets_reps: str | None = Field(default=None, max_length=80)


class StepOrder(InputModel):
    step_ids: list[int]
