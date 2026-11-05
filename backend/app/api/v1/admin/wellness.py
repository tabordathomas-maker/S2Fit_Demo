"""Contenido de Mi Ruta / S2 Box, retos, recompensas y redenciones."""

from typing import Annotated

from fastapi import APIRouter, Query, Response, status
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
from app.services import archive, audit, wellness_admin

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
    archive.apply_update(db, admin, obj, entity, obj.id, data.model_dump(exclude_unset=True, mode="json"))
    db.commit()
    return obj


def _get(db: DbSession, model, obj_id: int):
    obj = db.get(model, obj_id)
    if obj is None:
        raise not_found()
    return obj


def _archive(db: DbSession, admin: Profile, model, obj_id: int, entity: str, archived: bool, flag: str):
    obj = _get(db, model, obj_id)
    archive.set_archived(db, admin, obj, entity, obj.id, archived, flag)
    db.commit()
    return obj


IncludeArchived = Annotated[bool, Query(description="Incluye lo archivado (por defecto solo lo visible).")]


@router.get("/content", response_model=list[AdminContentOut])
def list_content(_: AdminUser, db: DbSession, include_archived: IncludeArchived = False):
    stmt = select(ContentItem).order_by(ContentItem.kind, ContentItem.sort_order, ContentItem.id)
    if not include_archived:
        stmt = stmt.where(ContentItem.is_published.is_(True))
    return db.scalars(stmt).all()


@router.post("/content", response_model=AdminContentOut, status_code=status.HTTP_201_CREATED)
def create_content(data: ContentCreate, admin: AdminUser, db: DbSession):
    return _create(db, admin, ContentItem, data, "content")


@router.patch("/content/{item_id}", response_model=AdminContentOut)
def update_content(item_id: int, data: ContentUpdate, admin: AdminUser, db: DbSession):
    return _update(db, admin, ContentItem, item_id, data, "content")


@router.post("/content/{item_id}/archive", response_model=AdminContentOut)
def archive_content(item_id: int, admin: AdminUser, db: DbSession):
    return _archive(db, admin, ContentItem, item_id, "content", True, "is_published")


@router.post("/content/{item_id}/restore", response_model=AdminContentOut)
def restore_content(item_id: int, admin: AdminUser, db: DbSession):
    return _archive(db, admin, ContentItem, item_id, "content", False, "is_published")


@router.delete("/content/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_content(item_id: int, admin: AdminUser, db: DbSession):
    wellness_admin.delete_content(db, admin, item_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/challenges", response_model=list[AdminChallengeOut])
def list_challenges(_: AdminUser, db: DbSession, include_archived: IncludeArchived = False):
    stmt = select(Challenge).order_by(Challenge.sort_order, Challenge.id)
    if not include_archived:
        stmt = stmt.where(Challenge.is_active.is_(True))
    return db.scalars(stmt).all()


@router.post("/challenges", response_model=AdminChallengeOut, status_code=status.HTTP_201_CREATED)
def create_challenge(data: ChallengeCreate, admin: AdminUser, db: DbSession):
    return _create(db, admin, Challenge, data, "challenge")


@router.patch("/challenges/{challenge_id}", response_model=AdminChallengeOut)
def update_challenge(challenge_id: int, data: ChallengeUpdate, admin: AdminUser, db: DbSession):
    return _update(db, admin, Challenge, challenge_id, data, "challenge")


@router.post("/challenges/{item_id}/archive", response_model=AdminChallengeOut)
def archive_challenge(item_id: int, admin: AdminUser, db: DbSession):
    return _archive(db, admin, Challenge, item_id, "challenge", True, "is_active")


@router.post("/challenges/{item_id}/restore", response_model=AdminChallengeOut)
def restore_challenge(item_id: int, admin: AdminUser, db: DbSession):
    return _archive(db, admin, Challenge, item_id, "challenge", False, "is_active")


@router.delete("/challenges/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_challenge(item_id: int, admin: AdminUser, db: DbSession):
    wellness_admin.delete_challenge(db, admin, item_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/rewards", response_model=list[AdminRewardOut])
def list_rewards(_: AdminUser, db: DbSession, include_archived: IncludeArchived = False):
    stmt = select(Reward).order_by(Reward.kind, Reward.threshold_pct)
    if not include_archived:
        stmt = stmt.where(Reward.is_active.is_(True))
    return db.scalars(stmt).all()


@router.post("/rewards", response_model=AdminRewardOut, status_code=status.HTTP_201_CREATED)
def create_reward(data: RewardCreate, admin: AdminUser, db: DbSession):
    return _create(db, admin, Reward, data, "reward")


@router.patch("/rewards/{reward_id}", response_model=AdminRewardOut)
def update_reward(reward_id: int, data: RewardUpdate, admin: AdminUser, db: DbSession):
    return _update(db, admin, Reward, reward_id, data, "reward")


@router.post("/rewards/{item_id}/archive", response_model=AdminRewardOut)
def archive_reward(item_id: int, admin: AdminUser, db: DbSession):
    return _archive(db, admin, Reward, item_id, "reward", True, "is_active")


@router.post("/rewards/{item_id}/restore", response_model=AdminRewardOut)
def restore_reward(item_id: int, admin: AdminUser, db: DbSession):
    return _archive(db, admin, Reward, item_id, "reward", False, "is_active")


@router.delete("/rewards/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reward(item_id: int, admin: AdminUser, db: DbSession):
    wellness_admin.delete_reward(db, admin, item_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
