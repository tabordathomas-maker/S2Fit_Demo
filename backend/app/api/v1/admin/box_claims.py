"""Reclamos de las cajas S2 Box."""

import uuid

from fastapi import APIRouter, Query

from app.api.deps import AdminUser, DbSession
from app.core import clock
from app.models.enums import BoxClaimStatus
from app.schemas.box_claims import AdminBoxClaimOut, BoxClaimDecision
from app.services import box_claims

router = APIRouter(prefix="/s2box/claims", tags=["admin: S2 Box"])


def _present(claim) -> dict:
    return {
        "id": claim.id, "reference": claim.reference, "status": claim.status, "box_id": claim.box_id,
        "box_title": claim.box_title, "customer_note": claim.customer_note, "admin_notes": claim.admin_notes,
        "decided_at": claim.decided_at, "created_at": claim.created_at, "user_id": claim.user_id,
        "customer_email": claim.user.email, "customer_name": claim.user.full_name,
        "customer_phone": claim.user.phone,
    }


@router.get("", response_model=list[AdminBoxClaimOut])
def list_claims(_: AdminUser, db: DbSession, status: BoxClaimStatus | None = Query(default=None)):
    return [_present(c) for c in box_claims.list_all(db, status)]


@router.post("/{claim_id}/accept", response_model=AdminBoxClaimOut)
def accept_claim(claim_id: uuid.UUID, data: BoxClaimDecision, admin: AdminUser, db: DbSession):
    claim = box_claims.decide(db, claim_id, admin, BoxClaimStatus.accepted, data.admin_notes, clock.now())
    db.commit()
    return _present(claim)


@router.post("/{claim_id}/reject", response_model=AdminBoxClaimOut)
def reject_claim(claim_id: uuid.UUID, data: BoxClaimDecision, admin: AdminUser, db: DbSession):
    claim = box_claims.decide(db, claim_id, admin, BoxClaimStatus.rejected, data.admin_notes, clock.now())
    db.commit()
    return _present(claim)
