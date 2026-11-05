import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, TimestampMixin, enum_check
from app.models.enums import AccessLevel, RedemptionStatus, RewardKind


class UserHabit(CreatedAtMixin, Base):
    __tablename__ = "user_habits"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_habits_user_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class HabitLog(Base):
    __tablename__ = "habit_logs"
    __table_args__ = (
        UniqueConstraint("habit_id", "log_date", name="uq_habit_logs_habit_date"),
        Index("ix_habit_logs_user_date", "user_id", "log_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("user_habits.id", ondelete="CASCADE"))
    # Redundante con el hábito, pero permite filtrar por dueña sin joins y con RLS.
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    log_date: Mapped[date] = mapped_column(Date)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Reward(TimestampMixin, Base):
    __tablename__ = "rewards"
    __table_args__ = (
        enum_check("kind", RewardKind),
        enum_check("access", AccessLevel),
        CheckConstraint("threshold_pct BETWEEN 1 AND 100", name="threshold_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    threshold_pct: Mapped[int] = mapped_column(Integer)
    # Obsoleta: Mi Ruta es gratis; ya no filtra nada. Se conserva para evitar una migración destructiva.
    access: Mapped[str] = mapped_column(String(10), default=AccessLevel.free)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class Challenge(TimestampMixin, Base):
    __tablename__ = "challenges"
    __table_args__ = (
        enum_check("access", AccessLevel),
        CheckConstraint("target_count > 0", name="target_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    # Obsoleta: Mi Ruta es gratis; ya no filtra nada. Se conserva para evitar una migración destructiva.
    access: Mapped[str] = mapped_column(String(10), default=AccessLevel.free)
    # Número de días con avance registrado para completar el reto.
    target_count: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class ChallengeParticipation(Base):
    __tablename__ = "challenge_participations"
    __table_args__ = (
        UniqueConstraint("challenge_id", "user_id", name="uq_challenge_participations_challenge_user"),
        CheckConstraint("progress >= 0", name="progress_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    challenge_id: Mapped[int] = mapped_column(ForeignKey("challenges.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    last_progress_on: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    challenge: Mapped[Challenge] = relationship()


class RewardRedemption(CreatedAtMixin, Base):
    __tablename__ = "reward_redemptions"
    __table_args__ = (
        enum_check("status", RedemptionStatus),
        UniqueConstraint("reward_id", "user_id", name="uq_reward_redemptions_reward_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reward_id: Mapped[int] = mapped_column(ForeignKey("rewards.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default=RedemptionStatus.requested)
    admin_notes: Mapped[str | None] = mapped_column(Text)
    fulfilled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fulfilled_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("profiles.id", ondelete="SET NULL"))

    reward: Mapped[Reward] = relationship()
