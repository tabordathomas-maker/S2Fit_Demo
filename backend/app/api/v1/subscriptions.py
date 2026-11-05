from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, rate_limited
from app.core import clock
from app.models import Plan
from app.schemas.subscriptions import (
    MembershipStatus,
    PlanOut,
    SubscriptionRequestCreate,
    SubscriptionRequestCreated,
    SubscriptionRequestOut,
)
from app.services import subscriptions, whatsapp

router = APIRouter(tags=["S2 Box"])


@router.get("/plans", response_model=list[PlanOut])
def list_plans(db: DbSession):
    plans = db.scalars(select(Plan).where(Plan.is_active.is_(True), Plan.deleted_at.is_(None)).order_by(Plan.sort_order, Plan.id)).all()
    # Precio oculto: el público no recibe el valor (la web muestra «Precio por confirmar»).
    return [{**PlanOut.model_validate(p).model_dump(), "price": None if p.hide_price else p.price} for p in plans]


@router.post("/subscriptions/requests", response_model=SubscriptionRequestCreated,
             status_code=status.HTTP_201_CREATED, dependencies=[rate_limited("subscription_requests")])
def create_subscription_request(data: SubscriptionRequestCreate, user: CurrentUser, db: DbSession, response: Response):
    request, existed = subscriptions.create_request(db, user, data.plan_code)
    db.commit()
    if existed:
        response.status_code = status.HTTP_200_OK
    return {
        **SubscriptionRequestOut.model_validate(request).model_dump(),
        "whatsapp_message": whatsapp.subscription_message(request),
        "already_existed": existed,
    }


@router.get("/subscriptions/me", response_model=MembershipStatus)
def my_membership(user: CurrentUser, db: DbSession):
    now = clock.now()
    sub = subscriptions.get_user_subscription(db, user.id)
    if sub is not None and sub.status == "active" and sub.ends_at <= now:
        subscriptions.refresh_status(sub, now)
        db.commit()
    return {
        "is_active": subscriptions.has_active_membership(db, user.id, now),
        "subscription": sub if sub is not None and sub.starts_at is not None else None,
        "pending_request": subscriptions.get_pending_request(db, user.id),
    }
