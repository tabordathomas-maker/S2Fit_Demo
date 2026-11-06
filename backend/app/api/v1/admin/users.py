"""Perfiles, auditoría y subida de imágenes."""

import uuid
from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile
from sqlalchemy import or_, select

from app.api.deps import AdminUser, DbSession
from app.core import clock
from app.core.errors import not_found
from app.models import Profile, Subscription
from app.models.enums import SubscriptionStatus
from app.schemas.access_codes import MiRutaToggle
from app.schemas.admin import MediaUploadResult, UploadResult
from app.schemas.profile import AdminProfileOut, ProfileOut
from app.services import audit, mi_ruta_access, storage

router = APIRouter(tags=["admin: usuarios y auditoría"])


def plus_status_of(status: str | None, ends_at, now) -> str:
    if status is None:
        return "none"
    if status == SubscriptionStatus.active and (ends_at is None or ends_at <= now):
        return "expired"
    return status


@router.get("/profiles", response_model=list[AdminProfileOut])
def list_profiles(
    _: AdminUser,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=80)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    stmt = select(Profile, Subscription.status, Subscription.ends_at).outerjoin(
        Subscription, Subscription.user_id == Profile.id
    )
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(Profile.email.ilike(pattern), Profile.full_name.ilike(pattern), Profile.phone.ilike(pattern)))
    rows = db.execute(stmt.order_by(Profile.created_at.desc()).limit(limit).offset(offset)).all()
    now = clock.now()
    return [
        {**ProfileOut.model_validate(p).model_dump(), "plus_status": plus_status_of(st, ends, now), "plus_ends_at": ends,
         "mi_ruta_unlocked_at": p.mi_ruta_unlocked_at, "mi_ruta_unlock_source": p.mi_ruta_unlock_source}
        for p, st, ends in rows
    ]


@router.post("/users/{user_id}/mi-ruta", response_model=AdminProfileOut)
def set_user_mi_ruta(user_id: uuid.UUID, data: MiRutaToggle, admin: AdminUser, db: DbSession):
    """Habilita o quita Mi Ruta a mano (por ejemplo para ventas fuera de la página)."""
    profile = db.get(Profile, user_id)
    if profile is None:
        raise not_found("La persona no existe.")
    now = clock.now()
    mi_ruta_access.set_by_admin(db, admin, profile, data.enabled, now)
    db.commit()
    sub = db.execute(select(Subscription.status, Subscription.ends_at).where(Subscription.user_id == profile.id)).first()
    status, ends = (sub.status, sub.ends_at) if sub else (None, None)
    return {**ProfileOut.model_validate(profile).model_dump(), "plus_status": plus_status_of(status, ends, now),
            "plus_ends_at": ends, "mi_ruta_unlocked_at": profile.mi_ruta_unlocked_at,
            "mi_ruta_unlock_source": profile.mi_ruta_unlock_source}


@router.post("/uploads/product-image", response_model=UploadResult)
def upload_product_image(admin: AdminUser, db: DbSession, file: Annotated[UploadFile, File()]):
    content = file.file.read(storage.MAX_IMAGE_BYTES + 1)
    url = storage.upload_product_image(content, file.content_type or "")
    audit.record(db, admin, "upload.product_image", "storage", storage.object_key(url), {"filename": file.filename, "url": url})
    db.commit()
    return {"url": url}


@router.post("/uploads/content-media", response_model=MediaUploadResult)
def upload_content_media(admin: AdminUser, db: DbSession, file: Annotated[UploadFile, File()]):
    """Imagen de portada o video para rutinas, recetas y contenido de S2 Box."""
    content = file.file.read(storage.MAX_VIDEO_BYTES + 1)
    url, media_type = storage.upload_content_media(content, file.content_type or "")
    audit.record(db, admin, "upload.content_media", "storage", storage.object_key(url), {"filename": file.filename, "type": media_type, "url": url})
    db.commit()
    return {"url": url, "media_type": media_type}
