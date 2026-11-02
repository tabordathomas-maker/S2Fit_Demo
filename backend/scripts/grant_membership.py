"""Activa (o cancela) S2 Plus de una cuenta como cortesía administrativa, sin pagos.

Se ejecuta en una terminal con acceso a DATABASE_URL (tu equipo apuntando a la base
de Supabase), nunca desde el navegador.

Uso:
  python -m scripts.grant_membership --email persona@correo.com --days 30
  python -m scripts.grant_membership --email persona@correo.com --cancel

La persona debe haberse registrado e iniciado sesión al menos una vez. Usa el primer
plan activo. No crea pagos ni renovaciones.
"""

import argparse
import sys
from datetime import timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select

from app.core import clock
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models import Plan, Profile, Subscription
from app.models.enums import SubscriptionStatus

COURTESY_REFERENCE = "CORTESIA-ADMIN"


def grant_membership(db, email: str, days: int = 30, cancel: bool = False) -> str:
    """Activa por `days` días (extendiendo si ya está vigente) o cancela. Devuelve el mensaje a mostrar."""
    email = email.strip().lower()
    profile = db.scalars(select(Profile).where(func.lower(Profile.email) == email)).first()
    if profile is None:
        raise LookupError("No existe ninguna cuenta con ese correo. La persona debe registrarse e iniciar sesión una vez.")

    now = clock.now()
    sub = db.scalars(select(Subscription).where(Subscription.user_id == profile.id)).first()

    if cancel:
        if sub is None:
            raise LookupError(f"{email} no tiene ninguna membresía que cancelar.")
        sub.status = SubscriptionStatus.cancelled
        sub.cancelled_at = now
        db.commit()
        return f"{email}: S2 Plus cancelada."

    plan = db.scalars(select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.sort_order, Plan.id)).first()
    if plan is None:
        raise LookupError("No hay ningún plan activo. Créalo en Admin > S2 Plus.")

    if sub is None:
        sub = Subscription(user_id=profile.id, plan_id=plan.id)
        db.add(sub)
    vigente = sub.status == SubscriptionStatus.active and sub.ends_at is not None and sub.ends_at > now
    start = sub.ends_at if vigente else now
    if not vigente:
        sub.starts_at = now
    sub.plan_id = plan.id
    sub.status = SubscriptionStatus.active
    sub.ends_at = start + timedelta(days=days)
    sub.cancelled_at = None
    sub.last_payment_reference = COURTESY_REFERENCE
    db.commit()

    timezone = get_settings().app_timezone
    until = sub.ends_at.astimezone(ZoneInfo(timezone)).date()
    return f"{email}: S2 Plus activa hasta {until} ({timezone})"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True)
    parser.add_argument("--days", type=int, default=30, help="Días de vigencia (1 a 3650). Por defecto 30.")
    parser.add_argument("--cancel", action="store_true", help="Cancela la membresía en vez de activarla.")
    args = parser.parse_args()
    if not 1 <= args.days <= 3650:
        sys.exit("--days debe estar entre 1 y 3650.")

    with SessionLocal() as db:
        try:
            message = grant_membership(db, args.email, args.days, args.cancel)
        except LookupError as exc:
            sys.exit(str(exc))
    print(message)


if __name__ == "__main__":
    main()
