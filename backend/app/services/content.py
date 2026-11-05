from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.models import ContentItem, Profile


def _present(item: ContentItem) -> dict:
    return {
        "id": item.id,
        "kind": item.kind,
        "title": item.title,
        "summary": item.summary,
        "meta": item.meta,
        "meal_slot": item.meal_slot,
        "cover_url": item.cover_url,
        "body": item.body,
        "media_url": item.media_url,
    }


def list_content(db: Session, kind: str | None, user: Profile | None, now: datetime) -> list[dict]:
    stmt = select(ContentItem).where(ContentItem.is_published.is_(True))
    if kind:
        stmt = stmt.where(ContentItem.kind == kind)
    items = db.scalars(stmt.order_by(ContentItem.sort_order, ContentItem.id))
    return [_present(item) for item in items]


def get_content(db: Session, item_id: int, user: Profile | None, now: datetime) -> dict:
    item = db.get(ContentItem, item_id)
    if item is None or not item.is_published:
        raise not_found("El contenido no existe.")
    return _present(item)
