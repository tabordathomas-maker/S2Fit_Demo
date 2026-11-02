"""Rutinas personalizadas: rutinas, pasos y avance de cada persona

- custom_routines: rutina creada por el administrador para una persona.
- routine_steps: pasos ordenados (position) con video, instrucciones y series/reps.
- routine_step_completions: avance de la persona (una vez por paso).

RLS activo en las tres. En Supabase, lectura directa solo de filas propias (y sin borradores);
toda escritura pasa por FastAPI.

Revision ID: 0004
Revises: 0003
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ["custom_routines", "routine_steps", "routine_step_completions"]

POLICIES = {
    "custom_routines": "user_id = auth.uid() AND status <> 'draft'",
    "routine_steps": (
        "EXISTS (SELECT 1 FROM custom_routines r WHERE r.id = routine_id "
        "AND r.user_id = auth.uid() AND r.status <> 'draft')"
    ),
    "routine_step_completions": "user_id = auth.uid()",
}


def _is_supabase() -> bool:
    return bool(op.get_bind().execute(sa.text("SELECT to_regprocedure('auth.uid()') IS NOT NULL")).scalar())


def upgrade() -> None:
    now = sa.text("now()")
    op.create_table(
        "custom_routines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("goal", sa.String(length=160), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="draft", nullable=False),
        sa.Column("sequential", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.CheckConstraint("status IN ('draft', 'active', 'archived')", name=op.f("ck_custom_routines_status_valid")),
        sa.CheckConstraint("char_length(title) >= 2", name=op.f("ck_custom_routines_title_length")),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], name=op.f("fk_custom_routines_user_id_profiles"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["profiles.id"], name=op.f("fk_custom_routines_created_by_profiles"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_custom_routines")),
    )
    op.create_index(op.f("ix_custom_routines_user_id"), "custom_routines", ["user_id"])

    op.create_table(
        "routine_steps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("routine_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column("block_label", sa.String(length=80), nullable=True),
        sa.Column("media_url", sa.String(length=500), nullable=True),
        sa.Column("cover_url", sa.String(length=500), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("sets_reps", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.CheckConstraint("position >= 1", name=op.f("ck_routine_steps_position_positive")),
        sa.CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 600", name=op.f("ck_routine_steps_duration_range")
        ),
        sa.ForeignKeyConstraint(["routine_id"], ["custom_routines.id"], name=op.f("fk_routine_steps_routine_id_custom_routines"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_routine_steps")),
        sa.UniqueConstraint(
            "routine_id", "position", name=op.f("uq_routine_steps_routine_position"), deferrable=True, initially="DEFERRED"
        ),
    )

    op.create_table(
        "routine_step_completions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("step_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("minutes", sa.Integer(), nullable=True),
        sa.Column("effort", sa.Integer(), nullable=True),
        sa.Column("note", sa.String(length=300), nullable=True),
        sa.CheckConstraint("minutes IS NULL OR minutes BETWEEN 1 AND 600", name=op.f("ck_routine_step_completions_minutes_range")),
        sa.CheckConstraint("effort IS NULL OR effort BETWEEN 1 AND 5", name=op.f("ck_routine_step_completions_effort_range")),
        sa.ForeignKeyConstraint(["step_id"], ["routine_steps.id"], name=op.f("fk_routine_step_completions_step_id_routine_steps"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], name=op.f("fk_routine_step_completions_user_id_profiles"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_routine_step_completions")),
        sa.UniqueConstraint("step_id", "user_id", name=op.f("uq_routine_step_completions_step_user")),
    )
    op.create_index(op.f("ix_routine_step_completions_user_id"), "routine_step_completions", ["user_id"])

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    if _is_supabase():
        for table, condition in POLICIES.items():
            op.execute(f"CREATE POLICY {table}_select_own ON {table} FOR SELECT TO authenticated USING ({condition})")


def downgrade() -> None:
    op.drop_table("routine_step_completions")
    op.drop_table("routine_steps")
    op.drop_table("custom_routines")
