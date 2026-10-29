import uuid
from datetime import date, datetime

from pydantic import Field

from app.models.enums import AccessLevel, RewardKind
from app.schemas.common import InputModel, ORMModel


class HabitOut(ORMModel):
    id: int
    name: str
    completed: bool


class HabitDay(ORMModel):
    date: date
    habits: list[HabitOut]
    completed: int
    total: int
    percent: int


class HabitHistoryDay(ORMModel):
    date: date
    completed: int
    total: int
    percent: int


class HabitSummary(ORMModel):
    today: HabitDay
    history: list[HabitHistoryDay]
    weekly_percent: int


class HabitCreate(InputModel):
    name: str = Field(min_length=2, max_length=80)


class HabitLogSet(InputModel):
    date: date
    completed: bool


class RewardOut(ORMModel):
    id: int
    kind: str
    name: str
    description: str | None
    threshold_pct: int
    access: str
    unlocked: bool
    redemption_status: str | None


class RewardsSummary(ORMModel):
    habit_percent: int
    challenge_percent: int
    rewards: list[RewardOut]


class ChallengeOut(ORMModel):
    id: int
    title: str
    description: str | None
    access: str
    target_count: int
    locked: bool
    joined: bool
    progress: int
    completed: bool
    can_progress_today: bool


class ChallengesSummary(ORMModel):
    challenge_percent: int
    challenges: list[ChallengeOut]


# --- Administración ---


class AdminChallengeOut(ORMModel):
    id: int
    title: str
    description: str | None
    access: str
    target_count: int
    is_active: bool
    is_demo: bool
    sort_order: int


class ChallengeCreate(InputModel):
    title: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    access: AccessLevel = AccessLevel.plus
    target_count: int = Field(gt=0, le=365)
    is_active: bool = True
    sort_order: int = 0


class ChallengeUpdate(InputModel):
    title: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    access: AccessLevel | None = None
    target_count: int | None = Field(default=None, gt=0, le=365)
    is_active: bool | None = None
    sort_order: int | None = None


class AdminRewardOut(ORMModel):
    id: int
    kind: str
    name: str
    description: str | None
    threshold_pct: int
    access: str
    is_active: bool
    is_demo: bool
    sort_order: int


class RewardCreate(InputModel):
    kind: RewardKind
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    threshold_pct: int = Field(ge=1, le=100)
    access: AccessLevel = AccessLevel.free
    is_active: bool = True
    sort_order: int = 0


class RewardUpdate(InputModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    threshold_pct: int | None = Field(default=None, ge=1, le=100)
    access: AccessLevel | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class AdminRedemptionOut(ORMModel):
    id: int
    reward_id: int
    reward_name: str
    user_id: uuid.UUID
    customer_email: str | None
    status: str
    admin_notes: str | None
    created_at: datetime
    fulfilled_at: datetime | None


class RedemptionDecision(InputModel):
    status: str = Field(pattern=r"^(fulfilled|cancelled)$")
    admin_notes: str | None = Field(default=None, max_length=2000)
