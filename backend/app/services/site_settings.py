"""Configuración editable de la tienda: por ahora, el número comercial de WhatsApp."""

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.phones import INVALID_PHONE_MESSAGE, normalize_co_mobile
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
    """Devuelve "57" + el celular de 10 dígitos, que es lo que pide wa.me.

    Acepta "300 123 4567", "+57 300 123 4567" o "573001234567".
    Devuelve None si el valor está vacío y lanza un error si no es un celular colombiano válido.
    """
    try:
        phone = normalize_co_mobile(raw)
    except ValueError as exc:
        raise invalid_number() from exc
    return f"57{phone}" if phone else None


def invalid_number() -> AppError:
    return AppError(422, "invalid_whatsapp_number", INVALID_PHONE_MESSAGE)


def set_whatsapp_number(db: Session, raw: str | None, admin: Profile | None) -> SiteSettings:
    settings = get_site_settings(db)
    settings.whatsapp_number = normalize_whatsapp(raw)
    settings.updated_by = admin.id if admin else None
    return settings
