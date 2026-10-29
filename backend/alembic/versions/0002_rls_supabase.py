"""RLS en todas las tablas y políticas de solo lectura para Supabase

Toda escritura pasa por FastAPI, que se conecta con el rol propietario de las tablas.
Las políticas solo cubren lecturas directas desde la API REST de Supabase (PostgREST)
con la clave pública: cada persona ve únicamente sus filas y el catálogo publicado.
Sin política, una tabla con RLS activado queda cerrada para anon/authenticated.

En un PostgreSQL sin Supabase (desarrollo local, pruebas) no existe auth.uid(), así
que solo se activa RLS y se omiten las políticas y la clave foránea a auth.users.

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ALL_TABLES = [
    "profiles", "categories", "products", "product_variants", "inventory_movements",
    "orders", "order_items", "payments", "admin_audit_logs", "plans",
    "subscription_requests", "subscriptions", "subscription_renewals", "content_items",
    "user_habits", "habit_logs", "challenges", "challenge_participations", "rewards",
    "reward_redemptions",
]

# tabla -> condición USING para el rol "authenticated" (lectura de filas propias).
OWN_ROWS = {
    "profiles": "id = auth.uid()",
    "orders": "user_id = auth.uid()",
    "order_items": "EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.user_id = auth.uid())",
    "payments": "user_id = auth.uid()",
    "subscription_requests": "user_id = auth.uid()",
    "subscriptions": "user_id = auth.uid()",
    "user_habits": "user_id = auth.uid()",
    "habit_logs": "user_id = auth.uid()",
    "challenge_participations": "user_id = auth.uid()",
    "reward_redemptions": "user_id = auth.uid()",
}

# tabla -> condición USING para anon y authenticated (contenido público).
PUBLIC_ROWS = {
    "categories": "is_active",
    "products": "is_active",
    "product_variants": "is_active",
    "plans": "is_active",
    "content_items": "is_published AND access = 'free'",
    "challenges": "is_active",
    "rewards": "is_active",
}


def _is_supabase() -> bool:
    return bool(op.get_bind().execute(sa.text("SELECT to_regprocedure('auth.uid()') IS NOT NULL")).scalar())


def upgrade() -> None:
    for table in ALL_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

    if not _is_supabase():
        return

    op.execute(
        "ALTER TABLE profiles ADD CONSTRAINT fk_profiles_id_auth_users "
        "FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE"
    )
    for table, condition in OWN_ROWS.items():
        op.execute(f"CREATE POLICY {table}_select_own ON {table} FOR SELECT TO authenticated USING ({condition})")
    for table, condition in PUBLIC_ROWS.items():
        op.execute(f"CREATE POLICY {table}_select_public ON {table} FOR SELECT TO anon, authenticated USING ({condition})")


def downgrade() -> None:
    if _is_supabase():
        for table in OWN_ROWS:
            op.execute(f"DROP POLICY IF EXISTS {table}_select_own ON {table}")
        for table in PUBLIC_ROWS:
            op.execute(f"DROP POLICY IF EXISTS {table}_select_public ON {table}")
        op.execute("ALTER TABLE profiles DROP CONSTRAINT IF EXISTS fk_profiles_id_auth_users")
    for table in ALL_TABLES:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
