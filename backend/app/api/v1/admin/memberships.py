"""Planes, solicitudes de suscripción y membresías."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import AdminUser, DbSession
from app.core import clock
from app.core.errors import not_found
from app.models import Plan, Profile, Subscription, SubscriptionRequest
from app.models.enums import SubscriptionRequestStatus, SubscriptionStatus
from app.schemas.subscriptions import (
    AdminSubscriptionOut,
    AdminSubscriptionRequestOut,
    AgreedTerms,
    MembershipCancel,
    MembershipGrant,
    MembershipOut,
    PlanCreate,
    PlanOut,
    PlanUpdate,
    SubscriptionCancel,
    SubscriptionOut,
    SubscriptionRequestOut,
)
from app.services import audit, subscriptions

router = APIRouter(tags=["admin: S2 Plus"])


def _present_request(r: SubscriptionRequest) -> dict:
    return {
        **SubscriptionRequestOut.model_validate(r).model_dump(),
        "user_id": r.user_id,
        "customer_email": r.user.email,
        "customer_name": r.user.full_name,
        "payment_id": r.payment.id if r.payment else None,
        "payment_status": r.payment.status if r.payment else None,
    }


def _present_subscription(s: Subscription) -> dict:
    return {
        **SubscriptionOut.model_validate(s).model_dump(),
        "user_id": s.user_id,
        "customer_email": s.user.email,
        "customer_name": s.user.full_name,
    }


# --- Planes ---


@router.get("/plans", response_model=list[PlanOut])
def list_plans(_: AdminUser, db: DbSession):
    return db.scalars(select(Plan).order_by(Plan.sort_order, Plan.id)).all()


@router.post("/plans", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(data: PlanCreate, admin: AdminUser, db: DbSession):
    plan = Plan(**data.model_dump())
    db.add(plan)
    db.flush()
    audit.record(db, admin, "plan.create", "plan", plan.id, data.model_dump())
    db.commit()
    return plan


@router.patch("/plans/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: int, data: PlanUpdate, admin: AdminUser, db: DbSession):
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise not_found("El plan no existe.")
    changes = data.model_dump(exclude_unset=True, exclude={"clear_price"})
    if data.clear_price:
        changes["price"] = None
    for field, value in changes.items():
        setattr(plan, field, value)
    audit.record(db, admin, "plan.update", "plan", plan.id, changes)
    db.commit()
    return plan


# --- Solicitudes ---


@router.get("/subscription-requests", response_model=list[AdminSubscriptionRequestOut])
def list_requests(
    _: AdminUser,
    db: DbSession,
    status: Annotated[SubscriptionRequestStatus | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
):
    stmt = select(SubscriptionRequest).options(
        selectinload(SubscriptionRequest.plan),
        selectinload(SubscriptionRequest.user),
        selectinload(SubscriptionRequest.payment),
    )
    if status:
        stmt = stmt.where(SubscriptionRequest.status == status)
    return [_present_request(r) for r in db.scalars(stmt.order_by(SubscriptionRequest.created_at.desc()).limit(limit))]


@router.post("/subscription-requests/{request_id}/terms", response_model=AdminSubscriptionRequestOut)
def set_terms(request_id: uuid.UUID, data: AgreedTerms, admin: AdminUser, db: DbSession):
    request = subscriptions.set_agreed_terms(db, request_id, admin, data)
    db.commit()
    db.refresh(request)
    return _present_request(request)


# --- Suscripciones ---


@router.get("/subscriptions", response_model=list[AdminSubscriptionOut])
def list_subscriptions(
    admin: AdminUser,
    db: DbSession,
    status: Annotated[SubscriptionStatus | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
):
    expired = subscriptions.expire_overdue(db, clock.now())
    if expired:
        db.commit()
    stmt = select(Subscription).options(
        selectinload(Subscription.plan), selectinload(Subscription.user), selectinload(Subscription.renewals)
    )
    if status:
        stmt = stmt.where(Subscription.status == status)
    rows = db.scalars(stmt.order_by(Subscription.ends_at.asc().nulls_last()).limit(limit))
    return [_present_subscription(s) for s in rows]


@router.post("/subscriptions/{subscription_id}/cancel", response_model=AdminSubscriptionOut)
def cancel_subscription(subscription_id: uuid.UUID, data: SubscriptionCancel, admin: AdminUser, db: DbSession):
    sub = subscriptions.cancel_subscription(db, subscription_id, admin, data.reason, clock.now())
    db.commit()
    db.refresh(sub)
    return _present_subscription(sub)


# --- S2 Plus manual (cortesías, pruebas, pagos en efectivo) ---


def _get_user(db: Session, user_id: uuid.UUID) -> Profile:
    user = db.get(Profile, user_id)
    if user is None:
        raise not_found("La persona no existe.")
    return user


def _present_membership(sub: Subscription | None) -> dict:
    if sub is None:
        return {"status": "none", "plan_name": None, "starts_at": None, "ends_at": None, "is_active": False}
    now = clock.now()
    is_active = sub.status == SubscriptionStatus.active and sub.ends_at is not None and sub.ends_at > now
    status = "expired" if sub.status == SubscriptionStatus.active and not is_active else sub.status
    return {"status": status, "plan_name": sub.plan.name, "starts_at": sub.starts_at, "ends_at": sub.ends_at,
            "is_active": is_active}


@router.get("/users/{user_id}/membership", response_model=MembershipOut)
def get_membership(user_id: uuid.UUID, _: AdminUser, db: DbSession):
    user = _get_user(db, user_id)
    return _present_membership(subscriptions.get_user_subscription(db, user.id))


@router.post("/users/{user_id}/membership/grant", response_model=MembershipOut)
def grant_membership(user_id: uuid.UUID, data: MembershipGrant, admin: AdminUser, db: DbSession):
    user = _get_user(db, user_id)
    sub = subscriptions.grant_membership(db, user, data.days, admin, data.reason)
    db.commit()
    db.refresh(sub)
    return _present_membership(sub)


@router.post("/users/{user_id}/membership/cancel", response_model=MembershipOut)
def cancel_membership(user_id: uuid.UUID, data: MembershipCancel, admin: AdminUser, db: DbSession):
    user = _get_user(db, user_id)
    sub = subscriptions.cancel_membership(db, user, admin, data.reason)
    db.commit()
    db.refresh(sub)
    return _present_membership(sub)
