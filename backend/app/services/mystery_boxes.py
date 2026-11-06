"""Cajas misteriosas de S2 Box.

La portada es pública. El contenido solo sale por get_content, que verifica el acceso en el backend
con la única regla de membresía (subscriptions.has_active_membership).
"""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, not_found
from app.models import BoxClaim, MysteryBox, Profile
from app.models.enums import AccessLevel
from app.schemas.mystery_boxes import MysteryBoxCreate, MysteryBoxUpdate
from app.services import archive, audit, subscriptions


def list_public(db: Session) -> list[MysteryBox]:
    stmt = (
        select(MysteryBox)
        .where(MysteryBox.is_active.is_(True), MysteryBox.deleted_at.is_(None))
        .order_by(MysteryBox.sort_order, MysteryBox.id)
    )
    return list(db.scalars(stmt))


def get_visible(db: Session, box_id: int) -> MysteryBox:
    """Caja que el público puede ver: activa y no eliminada. Las demás responden 404."""
    box = db.get(MysteryBox, box_id)
    if box is None or not box.is_active or box.deleted_at is not None:
        raise not_found("La caja no existe.")
    return box


def ensure_access(db: Session, box: MysteryBox, user: Profile | None, now: datetime) -> None:
    if box.content_access == AccessLevel.free:
        return
    if user is None:
        raise AppError(403, "membership_required", "Inicia sesión para abrir esta caja.", {"login_required": True})
    if not subscriptions.has_active_membership(db, user.id, now):
        raise AppError(
            403, "membership_required", "Necesitas la membresía S2 Box activa para abrir esta caja.",
            {"login_required": False},
        )


def get_content(db: Session, box_id: int, user: Profile | None, now: datetime) -> MysteryBox:
    box = get_visible(db, box_id)
    ensure_access(db, box, user, now)
    return box


# --- Administración ---


def list_all(db: Session, include_deleted: bool = False) -> list[MysteryBox]:
    stmt = select(MysteryBox).order_by(MysteryBox.sort_order, MysteryBox.id)
    if not include_deleted:
        stmt = stmt.where(MysteryBox.deleted_at.is_(None))
    return list(db.scalars(stmt))


def get_box(db: Session, box_id: int) -> MysteryBox:
    box = db.get(MysteryBox, box_id)
    if box is None or box.deleted_at is not None:
        raise not_found("La caja no existe.")
    return box


def create_box(db: Session, admin: Profile, data: MysteryBoxCreate) -> MysteryBox:
    now = clock.now()
    box = MysteryBox(**data.model_dump(), created_at=now, updated_at=now)
    db.add(box)
    db.flush()
    audit.record(db, admin, "mystery_box.create", "mystery_box", box.id, {"title": box.title, "access": box.content_access})
    return box


def update_box(db: Session, admin: Profile, box_id: int, data: MysteryBoxUpdate) -> MysteryBox:
    box = get_box(db, box_id)
    changes = data.model_dump(exclude_unset=True)
    real = archive.apply_update(db, admin, box, "mystery_box", box.id, changes)
    if real:
        box.updated_at = clock.now()
    db.flush()
    return box


def delete_box(db: Session, admin: Profile, box_id: int) -> str:
    """Borrado real si nunca se reclamó; lógico (se oculta) si tiene reclamos, que guardan el historial."""
    box = get_box(db, box_id)
    claims = db.scalar(select(func.count()).select_from(BoxClaim).where(BoxClaim.box_id == box.id)) or 0
    return archive.delete_or_soft_delete(
        db, admin, box, "mystery_box", box.id, "mystery_box", {}, {"claims": claims}, "",
    )
