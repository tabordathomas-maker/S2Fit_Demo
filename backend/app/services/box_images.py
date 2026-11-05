"""Galería de S2 Box."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import not_found
from app.models import BoxImage, Profile
from app.schemas.box_images import BoxImageCreate, BoxImageUpdate
from app.services import audit


def list_public(db: Session) -> list[BoxImage]:
    stmt = select(BoxImage).where(BoxImage.is_active.is_(True)).order_by(BoxImage.sort_order, BoxImage.id)
    return list(db.scalars(stmt))


def list_all(db: Session) -> list[BoxImage]:
    return list(db.scalars(select(BoxImage).order_by(BoxImage.sort_order, BoxImage.id)))


def get_image(db: Session, image_id: int) -> BoxImage:
    image = db.get(BoxImage, image_id)
    if image is None:
        raise not_found("La imagen no existe.")
    return image


def create_image(db: Session, admin: Profile, data: BoxImageCreate) -> BoxImage:
    now = clock.now()
    image = BoxImage(**data.model_dump(), created_at=now, updated_at=now)
    db.add(image)
    db.flush()
    audit.record(db, admin, "box_image.create", "box_image", image.id)
    return image


def update_image(db: Session, admin: Profile, image_id: int, data: BoxImageUpdate) -> BoxImage:
    image = get_image(db, image_id)
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(image, field, value)
    image.updated_at = clock.now()
    db.flush()
    audit.record(db, admin, "box_image.update", "box_image", image.id, {"fields": sorted(changes)})
    return image


def delete_image(db: Session, admin: Profile, image_id: int) -> None:
    image = get_image(db, image_id)
    db.delete(image)
    db.flush()
    audit.record(db, admin, "box_image.delete", "box_image", image_id)
