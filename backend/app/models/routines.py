import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, enum_check
from app.models.enums import RoutineStatus


class CustomRoutine(TimestampMixin, Base):
    """Rutina creada por el administrador para una persona; se ve como roadmap en Mi Ruta (S2 Plus)."""

    __tablename__ = "custom_routines"
    __table_args__ = (
        enum_check("status", RoutineStatus),
        CheckConstraint("char_length(title) >= 2", name="title_length"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    goal: Mapped[str | None] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(20), default=RoutineStatus.draft, server_default=RoutineStatus.draft.value)
    # Si es verdadero, un paso se desbloquea al completar el anterior.
    sequential: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))

    steps: Mapped[list["RoutineStep"]] = relationship(
        back_populates="routine", order_by="RoutineStep.position", cascade="all, delete-orphan", passive_deletes=True
    )


class RoutineStep(TimestampMixin, Base):
    __tablename__ = "routine_steps"
    __table_args__ = (
        UniqueConstraint(
            "routine_id", "position", name="uq_routine_steps_routine_position", deferrable=True, initially="DEFERRED"
        ),
        CheckConstraint("position >= 1", name="position_positive"),
        CheckConstraint("duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 600", name="duration_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    routine_id: Mapped[int] = mapped_column(ForeignKey("custom_routines.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(160))
    instructions: Mapped[str | None] = mapped_column(Text)
    block_label: Mapped[str | None] = mapped_column(String(80))
    media_url: Mapped[str | None] = mapped_column(String(500))
    cover_url: Mapped[str | None] = mapped_column(String(500))
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    sets_reps: Mapped[str | None] = mapped_column(String(80))

    routine: Mapped[CustomRoutine] = relationship(back_populates="steps")
    completions: Mapped[list["RoutineStepCompletion"]] = relationship(
        back_populates="step", cascade="all, delete-orphan", passive_deletes=True
    )


class RoutineStepCompletion(Base):
    __tablename__ = "routine_step_completions"
    __table_args__ = (
        UniqueConstraint("step_id", "user_id", name="uq_routine_step_completions_step_user"),
        CheckConstraint("minutes IS NULL OR minutes BETWEEN 1 AND 600", name="minutes_range"),
        CheckConstraint("effort IS NULL OR effort BETWEEN 1 AND 5", name="effort_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    step_id: Mapped[int] = mapped_column(ForeignKey("routine_steps.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    minutes: Mapped[int | None] = mapped_column(Integer)
    effort: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(300))

    step: Mapped[RoutineStep] = relationship(back_populates="completions")
