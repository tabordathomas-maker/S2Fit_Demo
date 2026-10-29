"""Asigna el rol de una cuenta existente. Es la ÚNICA forma de crear administradores.

Se ejecuta en una terminal con acceso a DATABASE_URL (tu equipo o la Shell de Render),
nunca desde el navegador.

Uso:  python -m scripts.set_role --email persona@correo.com --role admin
La persona debe haberse registrado antes en la web (Supabase Auth).
"""

import argparse
import sys

from sqlalchemy import func, select, text

from app.core.database import SessionLocal
from app.models import Profile
from app.models.enums import Role


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", required=True, choices=[r.value for r in Role])
    args = parser.parse_args()
    email = args.email.strip().lower()

    with SessionLocal() as db:
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
                sys.exit(f"No existe ninguna cuenta con el correo {email}. Regístrala primero en la web.")
            profile = Profile(id=user_id, email=email, role=Role.customer)
            db.add(profile)
        previous = profile.role
        profile.role = args.role
        db.commit()
    print(f"{email}: rol {previous} -> {args.role}")


if __name__ == "__main__":
    main()
