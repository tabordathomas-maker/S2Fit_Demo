"""Acceso a Mi Ruta con código o QR

- access_codes: códigos de 6 caracteres que genera el admin (nota, teléfono, vencimiento, usos).
- profiles.mi_ruta_unlocked_at / mi_ruta_unlock_source / mi_ruta_code_id: Mi Ruta habilitada en la cuenta.
  El índice único parcial sobre mi_ruta_code_id liga cada código a una sola cuenta.
- Backfill: quien ya tiene un pedido pagado queda habilitado (source "order"), con la fecha del pedido pagado más antiguo.

RLS activo y sin políticas públicas: toda lectura y escritura pasa por FastAPI.

Revision ID: 0011
Revises: 0010
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


BACKFILL_SQL = """
    UPDATE profiles SET mi_ruta_unlocked_at = paid.first_paid, mi_ruta_unlock_source = 'order'
    FROM (
        SELECT user_id, MIN(paid_at) AS first_paid FROM orders
        WHERE status = 'paid' AND paid_at IS NOT NULL GROUP BY user_id
    ) AS paid
    WHERE profiles.id = paid.user_id AND profiles.mi_ruta_unlocked_at IS NULL
"""


def upgrade() -> None:
    now = sa.text("now()")
    op.create_table(
        "access_codes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=6), nullable=False),
        sa.Column("note", sa.String(length=200), nullable=True),
        sa.Column("phone", sa.String(length=10), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["profiles.id"], name=op.f("fk_access_codes_created_by_profiles"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_access_codes")),
        sa.UniqueConstraint("code", name=op.f("uq_access_codes_code")),
    )
    op.execute("ALTER TABLE access_codes ENABLE ROW LEVEL SECURITY")

    op.add_column("profiles", sa.Column("mi_ruta_unlocked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("profiles", sa.Column("mi_ruta_unlock_source", sa.String(length=20), nullable=True))
    op.add_column("profiles", sa.Column("mi_ruta_code_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_profiles_mi_ruta_code_id_access_codes", "profiles", "access_codes", ["mi_ruta_code_id"], ["id"], ondelete="SET NULL"
    )
    op.create_check_constraint(
        op.f("ck_profiles_mi_ruta_unlock_source_valid"), "profiles", "mi_ruta_unlock_source IS NULL OR mi_ruta_unlock_source IN ('order', 'code', 'admin')"
    )
    op.create_index(
        "uq_profiles_mi_ruta_code_id", "profiles", ["mi_ruta_code_id"], unique=True, postgresql_where=sa.text("mi_ruta_code_id IS NOT NULL")
    )

    op.execute(BACKFILL_SQL)


def downgrade() -> None:
    op.drop_index("uq_profiles_mi_ruta_code_id", table_name="profiles")
    op.drop_constraint("ck_profiles_mi_ruta_unlock_source_valid", "profiles", type_="check")
    op.drop_constraint("fk_profiles_mi_ruta_code_id_access_codes", "profiles", type_="foreignkey")
    op.drop_column("profiles", "mi_ruta_code_id")
    op.drop_column("profiles", "mi_ruta_unlock_source")
    op.drop_column("profiles", "mi_ruta_unlocked_at")
    op.drop_table("access_codes")
