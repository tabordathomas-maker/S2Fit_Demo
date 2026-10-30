"""Asigna el rol de una cuenta existente. Es la ÚNICA forma de crear administradores.

Se ejecuta en una terminal con acceso a DATABASE_URL (tu equipo apuntando a la base
de Supabase), nunca desde el navegador.

Uso:
  python -m scripts.set_role --email persona@correo.com --role admin
  python -m scripts.set_role --email persona@correo.com --role admin --whatsapp "+57 300 123 4567"

La persona debe haberse registrado antes en la web (Supabase Auth).

WhatsApp de la tienda: al nombrar un administrador, si la tienda todavía no tiene
número de WhatsApp, se usa el celular con el que esa persona se registró. Con
--whatsapp se fija ese número explícitamente (reemplaza al que hubiera). Después
se puede cambiar cuando quieras en Admin > Configuración.
"""

import argparse
import sys

from sqlalchemy import func, select, text

from app.core.database import SessionLocal
from app.core.errors import AppError
from app.models import Profile
from app.models.enums import Role
from app.services.site_settings import get_site_settings, normalize_whatsapp


def _registered_phone(db, profile: Profile) -> str | None:
    if profile.phone:
        return profile.phone
    # Si la persona aún no ha iniciado sesión, el celular solo está en los metadatos de Supabase.
    if db.scalar(text("SELECT to_regclass('auth.users') IS NOT NULL")):
        return db.scalar(
            text("SELECT raw_user_meta_data->>'phone' FROM auth.users WHERE id = :id"), {"id": profile.id}
        )
    return None


def assign_role(db, email: str, role: str, whatsapp: str | None = None) -> list[str]:
    """Cambia el rol y, si corresponde, el WhatsApp de la tienda. Devuelve los mensajes para mostrar."""
    email = email.strip().lower()
    profile = db.scalars(select(Profile).where(func.lower(Profile.email) == email)).first()
    if profile is None:
        # En Supabase el perfil se crea con el primer inicio de sesión; si aún no existe,
        # se busca la cuenta directamente en auth.users.
        has_auth = db.scalar(text("SELECT to_regclass('auth.users') IS NOT NULL"))
        user_id = (
            db.scalar(text("SELECT id FROM auth.users WHERE lower(email) = :email"), {"email": email})
            if has_auth
            else None
        )
        if user_id is None:
            raise LookupError(f"No existe ninguna cuenta con el correo {email}. Regístrala primero en la web.")
        profile = Profile(id=user_id, email=email, role=Role.customer)
        db.add(profile)
        db.flush()

    messages = []
    previous = profile.role
    profile.role = role
    messages.append(f"{email}: rol {previous} -> {role}")

    if role == Role.admin:
        settings = get_site_settings(db)
        candidate = whatsapp if whatsapp else (None if settings.whatsapp_number else _registered_phone(db, profile))
        if candidate:
            number = normalize_whatsapp(candidate)
            settings.whatsapp_number = number
            settings.updated_by = profile.id
            messages.append(f"WhatsApp de la tienda: {number}")
        elif settings.whatsapp_number:
            messages.append(f"WhatsApp de la tienda (sin cambios): {settings.whatsapp_number}")
        else:
            messages.append(
                "Aviso: la tienda aún no tiene WhatsApp. Agrégalo en Admin > Configuración o usa --whatsapp."
            )
    db.commit()
    return messages


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", required=True, choices=[r.value for r in Role])
    parser.add_argument("--whatsapp", help='Número comercial de WhatsApp, p. ej. "+57 300 123 4567".')
    args = parser.parse_args()

    with SessionLocal() as db:
        try:
            messages = assign_role(db, args.email, args.role, args.whatsapp)
        except LookupError as exc:
            sys.exit(str(exc))
        except AppError as exc:
            sys.exit(exc.message)
    print("\n".join(messages))


if __name__ == "__main__":
    main()
