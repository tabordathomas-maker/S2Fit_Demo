"""Campanita de notificaciones

- profiles.notifications_seen_at: última vez que la persona abrió la campanita. No hay tabla de
  notificaciones: se derivan de pedidos, solicitudes de membresía y reclamos.

Revision ID: 0009
Revises: 0008
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("profiles", sa.Column("notifications_seen_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("profiles", "notifications_seen_at")
