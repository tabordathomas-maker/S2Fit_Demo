"""Cajas misteriosas de S2 Box

- mystery_boxes: portada pública + contenido protegido (acceso free / plus). RLS activo y SIN políticas
  públicas: el contenido solo sale por FastAPI, después de verificar el acceso.
- box_claims.box_id: FK RESTRICT, nulo para los reclamos antiguos.
- Índice único parcial: un solo reclamo pendiente o aceptado por (user_id, box_id).

Revision ID: 0010
Revises: 0009
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    now = sa.text("now()")
    op.create_table(
        "mystery_boxes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("teaser", sa.String(length=300), nullable=True),
        sa.Column("cover_url", sa.Text(), nullable=False),
        sa.Column("cover_alt", sa.String(length=200), nullable=True),
        sa.Column("content_media_url", sa.Text(), nullable=True),
        sa.Column("content_description", sa.Text(), nullable=False),
        sa.Column("content_access", sa.String(length=10), server_default="plus", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.CheckConstraint("content_access IN ('free', 'plus')", name=op.f("ck_mystery_boxes_content_access_valid")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mystery_boxes")),
    )
    op.execute("ALTER TABLE mystery_boxes ENABLE ROW LEVEL SECURITY")

    op.add_column("box_claims", sa.Column("box_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        op.f("fk_box_claims_box_id_mystery_boxes"), "box_claims", "mystery_boxes", ["box_id"], ["id"], ondelete="RESTRICT"
    )
    op.create_index(op.f("ix_box_claims_box_id"), "box_claims", ["box_id"])
    op.create_index(
        "uq_box_claims_user_box_open", "box_claims", ["user_id", "box_id"], unique=True,
        postgresql_where=sa.text("box_id IS NOT NULL AND status IN ('pending', 'accepted')"),
    )


def downgrade() -> None:
    op.drop_index("uq_box_claims_user_box_open", table_name="box_claims")
    op.drop_index(op.f("ix_box_claims_box_id"), table_name="box_claims")
    op.drop_constraint(op.f("fk_box_claims_box_id_mystery_boxes"), "box_claims", type_="foreignkey")
    op.drop_column("box_claims", "box_id")
    op.drop_table("mystery_boxes")
