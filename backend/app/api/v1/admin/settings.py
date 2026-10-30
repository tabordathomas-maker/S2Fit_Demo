"""Configuración de la tienda editable desde el panel."""

from fastapi import APIRouter

from app.api.deps import AdminUser, DbSession
from app.models import Profile
from app.schemas.settings import AdminSettingsOut, SettingsUpdate
from app.services import audit
from app.services.site_settings import get_site_settings, set_whatsapp_number

router = APIRouter(tags=["admin: configuración"])


def _present(db: DbSession) -> dict:
    settings = get_site_settings(db)
    editor = db.get(Profile, settings.updated_by) if settings.updated_by else None
    return {
        "whatsapp_number": settings.whatsapp_number,
        "updated_at": settings.updated_at,
        "updated_by_email": editor.email if editor else None,
    }


@router.get("/settings", response_model=AdminSettingsOut)
def read_settings(_: AdminUser, db: DbSession):
    return _present(db)


@router.put("/settings", response_model=AdminSettingsOut)
def update_settings(data: SettingsUpdate, admin: AdminUser, db: DbSession):
    previous = get_site_settings(db).whatsapp_number
    settings = set_whatsapp_number(db, data.whatsapp_number, admin)
    audit.record(
        db, admin, "settings.whatsapp_update", "site_settings", 1,
        {"from": previous, "to": settings.whatsapp_number},
    )
    db.commit()
    db.refresh(settings)
    return _present(db)
