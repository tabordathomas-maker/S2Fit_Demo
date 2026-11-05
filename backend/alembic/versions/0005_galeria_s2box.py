"""Galería de S2 Box: imágenes de la caja sorpresa

- box_images: imágenes administrables (url, texto alternativo, orden y activa).

RLS activo. En Supabase, lectura pública solo de las activas; toda escritura pasa por FastAPI.

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _is_supabase() -> bool:
    return bool(op.get_bind().execute(sa.text("SELECT to_regprocedure('auth.uid()') IS NOT NULL")).scalar())


def upgrade() -> None:
    now = sa.text("now()")
    op.create_table(
        "box_images",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("alt_text", sa.String(length=200), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_box_images")),
    )
    op.execute("ALTER TABLE box_images ENABLE ROW LEVEL SECURITY")
    if _is_supabase():
        op.execute("CREATE POLICY box_images_select_public ON box_images FOR SELECT TO anon, authenticated USING (is_active)")


def downgrade() -> None:
    op.drop_table("box_images")
