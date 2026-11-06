"""Reclamos de la caja S2 Box

- box_claims: reclamo de una socia (S2-BOX-…) con estado pending / accepted / rejected.

RLS activo; toda lectura y escritura pasa por FastAPI.

Revision ID: 0008
Revises: 0007
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    now = sa.text("now()")
    op.create_table(
        "box_claims",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("reference", sa.String(length=24), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("customer_note", sa.String(length=500), nullable=True),
        sa.Column("admin_notes", sa.String(length=500), nullable=True),
        sa.Column("decided_by", sa.Uuid(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.CheckConstraint("status IN ('pending', 'accepted', 'rejected')", name=op.f("ck_box_claims_status_valid")),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"], name=op.f("fk_box_claims_user_id_profiles"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["decided_by"], ["profiles.id"], name=op.f("fk_box_claims_decided_by_profiles"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_box_claims")),
        sa.UniqueConstraint("reference", name=op.f("uq_box_claims_reference")),
    )
    op.create_index(op.f("ix_box_claims_user_id"), "box_claims", ["user_id"])
    op.create_index(op.f("ix_box_claims_status"), "box_claims", ["status"])
    op.execute("ALTER TABLE box_claims ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_table("box_claims")
