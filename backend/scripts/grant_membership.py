"""Activa (o cancela) S2 Box de una cuenta como cortesía administrativa, sin pagos.

Se ejecuta en una terminal con acceso a DATABASE_URL (tu equipo apuntando a la base
de Supabase), nunca desde el navegador. Usa la misma lógica que el panel de administración.

Uso:
  python -m scripts.grant_membership --email persona@correo.com --days 30 --reason "Cortesía"
  python -m scripts.grant_membership --email persona@correo.com --cancel --reason "Fin de prueba"

La persona debe haberse registrado e iniciado sesión al menos una vez. Usa el primer
plan activo. No crea pagos ni renovaciones. Si ya tiene S2 Box vigente, la extiende.
"""

import argparse
import sys
from zoneinfo import ZoneInfo

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.errors import AppError
from app.models import Profile
from app.services import subscriptions


def grant_membership(db, email: str, days: int = 30, cancel: bool = False, reason: str = "") -> str:
    """Activa por `days` días (extendiendo si ya está vigente) o cancela. Devuelve el mensaje a mostrar."""
    email = email.strip().lower()
    profile = db.scalars(select(Profile).where(func.lower(Profile.email) == email)).first()
    if profile is None:
        raise LookupError("No existe ninguna cuenta con ese correo. La persona debe registrarse e iniciar sesión una vez.")

    # admin=None: acción del "sistema" (como set_role.py). El registro de auditoría exige un
    # administrador, así que desde la terminal no se audita; el motivo solo se muestra aquí.
    if cancel:
        subscriptions.cancel_membership(db, profile, None, reason)
        db.commit()
        return f"{email}: S2 Box cancelada. Motivo: {reason}"

    sub = subscriptions.grant_membership(db, profile, days, None, reason)
    db.commit()
    timezone = get_settings().app_timezone
    until = sub.ends_at.astimezone(ZoneInfo(timezone)).date()
    return f"{email}: S2 Box activa hasta {until} ({timezone}). Motivo: {reason}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True)
    parser.add_argument("--days", type=int, default=30, help="Días de vigencia (1 a 3650). Por defecto 30.")
    parser.add_argument("--cancel", action="store_true", help="Cancela la membresía en vez de activarla.")
    parser.add_argument("--reason", required=True, help='Motivo, p. ej. "Cortesía" (3 a 200 caracteres).')
    args = parser.parse_args()
    if not 1 <= args.days <= 3650:
        sys.exit("--days debe estar entre 1 y 3650.")
    if not 3 <= len(args.reason.strip()) <= 200:
        sys.exit("--reason debe tener entre 3 y 200 caracteres.")

    with SessionLocal() as db:
        try:
            message = grant_membership(db, args.email, args.days, args.cancel, args.reason.strip())
        except LookupError as exc:
            sys.exit(str(exc))
        except AppError as exc:
            sys.exit(exc.message)
    print(message)


if __name__ == "__main__":
    main()
