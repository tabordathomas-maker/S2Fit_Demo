"""Reclamos de la caja S2 Box: la socia los crea y un administrador los acepta o rechaza."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import conflict, not_found
from app.core.references import new_reference
from app.models import BoxClaim, Profile
from app.models.enums import BoxClaimStatus
from app.services import audit, subscriptions


def create(db: Session, user: Profile, customer_note: str | None, now: datetime) -> BoxClaim:
    if not subscriptions.has_active_membership(db, user.id, now):
        raise conflict("membership_required", "Necesitas una membresía S2 Box activa para reclamar tu caja.")
    # Se bloquea la fila de la persona para que dos envíos simultáneos no creen dos reclamos pendientes.
    db.scalars(select(Profile).where(Profile.id == user.id).with_for_update()).one()
    pending = db.scalar(
        select(BoxClaim).where(BoxClaim.user_id == user.id, BoxClaim.status == BoxClaimStatus.pending)
    )
    if pending is not None:
        raise conflict("claim_already_pending", f"Ya tienes un reclamo pendiente ({pending.reference}).")
    for _ in range(5):
        claim = BoxClaim(reference=new_reference("BOX"), user_id=user.id, customer_note=customer_note or None)
        try:
            with db.begin_nested():
                db.add(claim)
        except IntegrityError:
            continue
        return claim
    raise conflict("reference_unavailable", "No pudimos generar la referencia. Intenta de nuevo.")


def list_for_user(db: Session, user: Profile) -> list[BoxClaim]:
    return list(db.scalars(select(BoxClaim).where(BoxClaim.user_id == user.id).order_by(BoxClaim.created_at.desc())))


def list_all(db: Session, status: str | None = None) -> list[BoxClaim]:
    stmt = select(BoxClaim).options(selectinload(BoxClaim.user)).order_by(BoxClaim.created_at.desc())
    if status:
        stmt = stmt.where(BoxClaim.status == status)
    return list(db.scalars(stmt))


def decide(
    db: Session, claim_id: uuid.UUID, admin: Profile, new_status: BoxClaimStatus, admin_notes: str | None, now: datetime
) -> BoxClaim:
    claim = db.scalars(
        select(BoxClaim).where(BoxClaim.id == claim_id).with_for_update().execution_options(populate_existing=True)
    ).one_or_none()
    if claim is None:
        raise not_found("El reclamo no existe.")
    if claim.status != BoxClaimStatus.pending:
        raise conflict("claim_already_decided", f"Este reclamo ya fue decidido (estado: {claim.status}).")
    claim.status = new_status
    claim.admin_notes = admin_notes or None
    claim.decided_by = admin.id
    claim.decided_at = now
    audit.record(db, admin, f"box_claim.{new_status.value}", "box_claim", claim.id, {"reference": claim.reference})
    return claim
