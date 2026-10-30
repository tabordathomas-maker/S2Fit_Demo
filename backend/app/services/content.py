from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.models import ContentItem, Profile
from app.models.enums import AccessLevel
from app.services.subscriptions import has_active_membership


def _present(item: ContentItem, member: bool) -> dict:
    locked = item.access == AccessLevel.plus and not member
    return {
        "id": item.id,
        "kind": item.kind,
        "title": item.title,
        "summary": item.summary,
        "meta": item.meta,
        "meal_slot": item.meal_slot,
        "access": item.access,
        "locked": locked,
        "cover_url": item.cover_url,
        "body": None if locked else item.body,
        "media_url": None if locked else item.media_url,
    }


def list_content(db: Session, kind: str | None, user: Profile | None, now: datetime) -> list[dict]:
    member = has_active_membership(db, user.id if user else None, now)
    stmt = select(ContentItem).where(ContentItem.is_published.is_(True))
    if kind:
        stmt = stmt.where(ContentItem.kind == kind)
    items = db.scalars(stmt.order_by(ContentItem.sort_order, ContentItem.id))
    return [_present(item, member) for item in items]


def get_content(db: Session, item_id: int, user: Profile | None, now: datetime) -> dict:
    item = db.get(ContentItem, item_id)
    if item is None or not item.is_published:
        raise not_found("El contenido no existe.")
    if item.access == AccessLevel.plus:
        if user is None:
            raise AppError(401, "unauthorized", "Inicia sesión para ver este contenido.")
        if not has_active_membership(db, user.id, now):
            raise AppError(403, "plus_required", "Este contenido es exclusivo para miembros activos de S2 Plus.")
    return _present(item, member=True)
