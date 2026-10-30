"""Configuración de la tienda (WhatsApp editable) y portada para el contenido

- site_settings: una sola fila con el número comercial de WhatsApp, que el
  administrador puede cambiar desde el panel. RLS activo y sin políticas: solo
  FastAPI lee y escribe esta tabla.
- content_items.cover_url: imagen de portada de cada rutina, receta o video.

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "site_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("whatsapp_number", sa.String(length=20), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("id = 1", name=op.f("ck_site_settings_single_row")),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["profiles.id"], name=op.f("fk_site_settings_updated_by_profiles"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_site_settings")),
    )
    op.execute("INSERT INTO site_settings (id) VALUES (1)")
    op.execute("ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY")

    op.add_column("content_items", sa.Column("cover_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("content_items", "cover_url")
    op.drop_table("site_settings")
