"""Contenido de Mi Ruta / S2 Plus, retos, recompensas y redenciones."""

from fastapi import APIRouter, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import AdminUser, DbSession
from app.core import clock
from app.core.errors import conflict, not_found
from app.models import Challenge, ContentItem, Profile, Reward, RewardRedemption
from app.models.enums import RedemptionStatus
from app.schemas.content import AdminContentOut, ContentCreate, ContentUpdate
from app.schemas.wellness import (
    AdminChallengeOut,
    AdminRedemptionOut,
    AdminRewardOut,
    ChallengeCreate,
    ChallengeUpdate,
    RedemptionDecision,
    RewardCreate,
    RewardUpdate,
)
from app.services import audit

router = APIRouter(tags=["admin: contenido y retos"])


def _create(db: DbSession, admin: Profile, model, data, entity: str):
    obj = model(**data.model_dump())
    db.add(obj)
    db.flush()
    audit.record(db, admin, f"{entity}.create", entity, obj.id, data.model_dump(mode="json"))
    db.commit()
    return obj


def _update(db: DbSession, admin: Profile, model, obj_id: int, data, entity: str):
    obj = db.get(model, obj_id)
    if obj is None:
        raise not_found()
    changes = data.model_dump(exclude_unset=True, mode="json")
    for field, value in changes.items():
        setattr(obj, field, value)
    audit.record(db, admin, f"{entity}.update", entity, obj.id, changes)
    db.commit()
    return obj


@router.get("/content", response_model=list[AdminContentOut])
def list_content(_: AdminUser, db: DbSession):
    return db.scalars(select(ContentItem).order_by(ContentItem.kind, ContentItem.sort_order, ContentItem.id)).all()


@router.post("/content", response_model=AdminContentOut, status_code=status.HTTP_201_CREATED)
def create_content(data: ContentCreate, admin: AdminUser, db: DbSession):
    return _create(db, admin, ContentItem, data, "content")


@router.patch("/content/{item_id}", response_model=AdminContentOut)
def update_content(item_id: int, data: ContentUpdate, admin: AdminUser, db: DbSession):
    return _update(db, admin, ContentItem, item_id, data, "content")


@router.get("/challenges", response_model=list[AdminChallengeOut])
def list_challenges(_: AdminUser, db: DbSession):
    return db.scalars(select(Challenge).order_by(Challenge.sort_order, Challenge.id)).all()


@router.post("/challenges", response_model=AdminChallengeOut, status_code=status.HTTP_201_CREATED)
def create_challenge(data: ChallengeCreate, admin: AdminUser, db: DbSession):
    return _create(db, admin, Challenge, data, "challenge")


@router.patch("/challenges/{challenge_id}", response_model=AdminChallengeOut)
def update_challenge(challenge_id: int, data: ChallengeUpdate, admin: AdminUser, db: DbSession):
    return _update(db, admin, Challenge, challenge_id, data, "challenge")


@router.get("/rewards", response_model=list[AdminRewardOut])
def list_rewards(_: AdminUser, db: DbSession):
    return db.scalars(select(Reward).order_by(Reward.kind, Reward.threshold_pct)).all()


@router.post("/rewards", response_model=AdminRewardOut, status_code=status.HTTP_201_CREATED)
def create_reward(data: RewardCreate, admin: AdminUser, db: DbSession):
    return _create(db, admin, Reward, data, "reward")


@router.patch("/rewards/{reward_id}", response_model=AdminRewardOut)
def update_reward(reward_id: int, data: RewardUpdate, admin: AdminUser, db: DbSession):
    return _update(db, admin, Reward, reward_id, data, "reward")


def _present_redemption(r: RewardRedemption, email: str | None) -> dict:
    return {
        "id": r.id,
        "reward_id": r.reward_id,
        "reward_name": r.reward.name,
        "user_id": r.user_id,
        "customer_email": email,
        "status": r.status,
        "admin_notes": r.admin_notes,
        "created_at": r.created_at,
        "fulfilled_at": r.fulfilled_at,
    }


@router.get("/redemptions", response_model=list[AdminRedemptionOut])
def list_redemptions(_: AdminUser, db: DbSession):
    rows = db.execute(
        select(RewardRedemption, Profile.email)
        .join(Profile, Profile.id == RewardRedemption.user_id)
        .options(selectinload(RewardRedemption.reward))
        .order_by(RewardRedemption.created_at.desc())
        .limit(200)
    )
    return [_present_redemption(r, email) for r, email in rows]


@router.post("/redemptions/{redemption_id}/decision", response_model=AdminRedemptionOut)
def decide_redemption(redemption_id: int, data: RedemptionDecision, admin: AdminUser, db: DbSession):
    redemption = db.get(RewardRedemption, redemption_id, with_for_update=True)
    if redemption is None:
        raise not_found("La redención no existe.")
    if redemption.status != RedemptionStatus.requested:
        raise conflict("redemption_processed", "Esta solicitud ya fue procesada.")
    redemption.status = data.status
    redemption.admin_notes = data.admin_notes
    if data.status == RedemptionStatus.fulfilled:
        redemption.fulfilled_at = clock.now()
        redemption.fulfilled_by = admin.id
    audit.record(db, admin, "redemption.decide", "reward_redemption", redemption.id, data.model_dump())
    db.commit()
    email = db.get(Profile, redemption.user_id).email
    return _present_redemption(redemption, email)
