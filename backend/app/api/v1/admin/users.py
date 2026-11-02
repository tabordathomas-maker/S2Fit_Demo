"""Perfiles, auditoría y subida de imágenes."""

from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import AdminUser, DbSession
from app.models import AdminAuditLog, Profile
from app.schemas.admin import AuditLogOut, MediaUploadResult, UploadResult
from app.schemas.profile import ProfileOut
from app.services import audit, storage

router = APIRouter(tags=["admin: usuarios y auditoría"])


@router.get("/profiles", response_model=list[ProfileOut])
def list_profiles(
    _: AdminUser,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=80)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    stmt = select(Profile)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(Profile.email.ilike(pattern), Profile.full_name.ilike(pattern), Profile.phone.ilike(pattern)))
    return db.scalars(stmt.order_by(Profile.created_at.desc()).limit(limit).offset(offset)).all()


@router.get("/audit-logs", response_model=list[AuditLogOut])
def list_audit_logs(
    _: AdminUser,
    db: DbSession,
    action: Annotated[str | None, Query(max_length=80)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    stmt = select(AdminAuditLog).options(selectinload(AdminAuditLog.admin))
    if action:
        stmt = stmt.where(AdminAuditLog.action == action)
    rows = db.scalars(stmt.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc()).limit(limit).offset(offset))
    return [
        {
            "id": log.id,
            "admin_id": log.admin_id,
            "admin_email": log.admin.email,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "details": log.details,
            "created_at": log.created_at,
        }
        for log in rows
    ]


@router.post("/uploads/product-image", response_model=UploadResult)
def upload_product_image(admin: AdminUser, db: DbSession, file: Annotated[UploadFile, File()]):
    content = file.file.read(storage.MAX_IMAGE_BYTES + 1)
    url = storage.upload_product_image(content, file.content_type or "")
    audit.record(db, admin, "upload.product_image", "storage", storage.object_key(url), {"filename": file.filename, "url": url})
    db.commit()
    return {"url": url}


@router.post("/uploads/content-media", response_model=MediaUploadResult)
def upload_content_media(admin: AdminUser, db: DbSession, file: Annotated[UploadFile, File()]):
    """Imagen de portada o video para rutinas, recetas y contenido de S2 Plus."""
    content = file.file.read(storage.MAX_VIDEO_BYTES + 1)
    url, media_type = storage.upload_content_media(content, file.content_type or "")
    audit.record(db, admin, "upload.content_media", "storage", storage.object_key(url), {"filename": file.filename, "type": media_type, "url": url})
    db.commit()
    return {"url": url, "media_type": media_type}
