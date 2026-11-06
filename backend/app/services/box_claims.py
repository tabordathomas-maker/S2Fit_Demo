"""Reclamos de una caja S2 Box: la persona los crea y un administrador los acepta o rechaza."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import conflict, not_found
from app.core.references import new_reference
from app.models import BoxClaim, Profile
from app.models.enums import BoxClaimStatus
from app.services import audit, mystery_boxes, whatsapp


def whatsapp_message(claim: BoxClaim, user: Profile) -> str:
    return whatsapp.box_claim_message(user.full_name or user.email or "una clienta", claim.reference)


def create(
    db: Session, user: Profile, box_id: int, customer_note: str | None, now: datetime
) -> tuple[BoxClaim, bool]:
    """Devuelve (reclamo, ya_existía). Idempotente: un reclamo pendiente de la misma caja se reutiliza."""
    box = mystery_boxes.get_visible(db, box_id)
    mystery_boxes.ensure_access(db, box, user, now)
    # Se bloquea la fila de la persona para que dos envíos simultáneos no creen dos reclamos.
    db.scalars(select(Profile).where(Profile.id == user.id).with_for_update()).one()
    current = db.scalars(
        select(BoxClaim)
        .options(selectinload(BoxClaim.box))
        .where(
            BoxClaim.user_id == user.id,
            BoxClaim.box_id == box.id,
            BoxClaim.status.in_([BoxClaimStatus.pending, BoxClaimStatus.accepted]),
        )
    ).first()
    if current is not None:
        if current.status == BoxClaimStatus.accepted:
            raise conflict("box_already_claimed", f"Ya reclamaste esta caja ({current.reference}).")
        return current, True
    for _ in range(5):
        claim = BoxClaim(
            reference=new_reference("BOX"), user_id=user.id, box_id=box.id, customer_note=customer_note or None
        )
        try:
            with db.begin_nested():
                db.add(claim)
        except IntegrityError:
            continue
        claim.box = box
        return claim, False
    raise conflict("reference_unavailable", "No pudimos generar la referencia. Intenta de nuevo.")


def list_for_user(db: Session, user: Profile) -> list[BoxClaim]:
    return list(db.scalars(
        select(BoxClaim).options(selectinload(BoxClaim.box)).where(BoxClaim.user_id == user.id)
        .order_by(BoxClaim.created_at.desc())
    ))


def list_all(db: Session, status: str | None = None) -> list[BoxClaim]:
    stmt = (
        select(BoxClaim).options(selectinload(BoxClaim.user), selectinload(BoxClaim.box))
        .order_by(BoxClaim.created_at.desc())
    )
    if status:
        stmt = stmt.where(BoxClaim.status == status)
    return list(db.scalars(stmt))


def decide(
    db: Session, claim_id: uuid.UUID, admin: Profile, new_status: BoxClaimStatus, admin_notes: str | None, now: datetime
) -> BoxClaim:
    claim = db.scalars(
        select(BoxClaim).options(selectinload(BoxClaim.user), selectinload(BoxClaim.box))
        .where(BoxClaim.id == claim_id).with_for_update(of=BoxClaim).execution_options(populate_existing=True)
    ).one_or_none()
    if claim is None:
        raise not_found("El reclamo no existe.")
    if claim.status != BoxClaimStatus.pending:
        raise conflict("claim_already_decided", f"Este reclamo ya fue decidido (estado: {claim.status}).")
    claim.status = new_status
    claim.admin_notes = admin_notes or None
    claim.decided_by = admin.id
    claim.decided_at = now
    audit.record(
        db, admin, f"box_claim.{new_status.value}", "box_claim", claim.id,
        {"reference": claim.reference, "box_id": claim.box_id, "user_id": str(claim.user_id)},
    )
    return claim
