"""Eliminación lógica de planes, productos y variantes

- deleted_at en plans, products y product_variants: lo que solo tiene historial se oculta (is_active = false
  y deleted_at con fecha) en vez de borrarse, porque pedidos, pagos y suscripciones lo referencian.

Revision ID: 0007
Revises: 0006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES = ("plans", "products", "product_variants")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_column(table, "deleted_at")
