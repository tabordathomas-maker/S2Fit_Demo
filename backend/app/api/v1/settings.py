from fastapi import APIRouter

from app.api.deps import DbSession
from app.schemas.settings import PublicSettingsOut
from app.services.site_settings import get_site_settings

router = APIRouter(prefix="/settings", tags=["configuración"])


@router.get("", response_model=PublicSettingsOut)
def public_settings(db: DbSession):
    """Datos públicos que el sitio necesita al cargar (número de WhatsApp de la tienda)."""
    return {"whatsapp_number": get_site_settings(db).whatsapp_number}
