"""Códigos de plan automáticos: se recalculan los de planes sin historial

- El código interno de un plan ahora se genera siempre a partir del nombre. Los planes renombrados antes de este
  cambio conservaban códigos viejos («plus-anual» para «S2 Box Anual»): aquí se corrigen, una sola vez.
- Solo se tocan los planes SIN historial (sin solicitudes de suscripción ni suscripciones; los pagos cuelgan de las
  solicitudes). Los demás conservan su código.
- La regla de slugify y de unicidad se copia aquí a propósito: las migraciones no importan código de app/.

Revision ID: 0013
Revises: 0012
"""

import re
import unicodedata
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CODE_MAX = 40
FALLBACK_CODE = "plan"


def slugify_code(name: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]", "-", ascii_text)).strip("-")[:CODE_MAX].rstrip("-")
    return slug if len(slug) >= 2 else FALLBACK_CODE


def unique_code(base: str, taken: set[str]) -> str:
    if base not in taken:
        return base
    n = 2
    while True:
        suffix = f"-{n}"
        candidate = base[: CODE_MAX - len(suffix)].rstrip("-") + suffix
        if candidate not in taken:
            return candidate
        n += 1


def regenerate_codes(conn) -> dict[int, tuple[str, str]]:
    """Recalcula el código de cada plan sin historial. Devuelve {plan_id: (antes, después)} de los que cambiaron."""
    plans = conn.execute(sa.text(
        """
        SELECT p.id, p.name, p.code,
               NOT EXISTS (SELECT 1 FROM subscription_requests r WHERE r.plan_id = p.id)
               AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.plan_id = p.id) AS no_history
        FROM plans p ORDER BY p.id
        """
    )).all()
    codes = {plan_id: code for plan_id, _, code, _ in plans}
    changed: dict[int, tuple[str, str]] = {}
    for plan_id, name, code, no_history in plans:
        if not no_history:
            continue
        taken = {other for other_id, other in codes.items() if other_id != plan_id}
        new_code = unique_code(slugify_code(name), taken)
        if new_code != code:
            conn.execute(sa.text("UPDATE plans SET code = :code WHERE id = :id"), {"code": new_code, "id": plan_id})
            codes[plan_id] = new_code
            changed[plan_id] = (code, new_code)
    return changed


def upgrade() -> None:
    regenerate_codes(op.get_bind())


def downgrade() -> None:
    # No-op: los códigos viejos no se guardaron y no tienen significado para las clientas
    # (WhatsApp usa el nombre del plan y las solicitudes guardan plan_id).
    pass
