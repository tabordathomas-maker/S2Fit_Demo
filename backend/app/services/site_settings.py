"""Configuración editable de la tienda: por ahora, el número comercial de WhatsApp."""

import re

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Profile, SiteSettings


def get_site_settings(db: Session) -> SiteSettings:
    """Devuelve la única fila de configuración, creándola si falta."""
    settings = db.get(SiteSettings, 1)
    if settings is None:
        settings = SiteSettings(id=1)
        db.add(settings)
        db.flush()
    return settings


def normalize_whatsapp(raw: str | None) -> str | None:
    """Deja solo dígitos con indicativo de país, que es lo que pide wa.me.

    Acepta formatos como "+57 300 123 4567", "57-300-1234567" o "3001234567".
    Un celular colombiano de 10 dígitos que empieza por 3 recibe el indicativo 57.
    Devuelve None si el valor está vacío y lanza un error si no es un número válido.
    """
    if raw is None or not raw.strip():
        return None
    if re.search(r"[^0-9+\s().-]", raw):
        raise invalid_number()
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10 and digits.startswith("3"):
        digits = "57" + digits
    if not 8 <= len(digits) <= 15:
        raise invalid_number()
    return digits


def invalid_number() -> AppError:
    return AppError(
        422,
        "invalid_whatsapp_number",
        "Escribe un número de WhatsApp válido con indicativo de país, por ejemplo +57 300 123 4567.",
    )


def set_whatsapp_number(db: Session, raw: str | None, admin: Profile | None) -> SiteSettings:
    settings = get_site_settings(db)
    settings.whatsapp_number = normalize_whatsapp(raw)
    settings.updated_by = admin.id if admin else None
    return settings
