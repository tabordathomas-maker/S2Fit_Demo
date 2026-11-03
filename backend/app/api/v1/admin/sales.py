"""Pedidos y bandeja de pagos manuales."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import AdminUser, DbSession
from app.core import clock
from app.core.errors import not_found
from app.models import Order, Payment
from app.models.enums import OrderStatus, PaymentStatus
from app.schemas.admin import ExpiredSweepResult
from app.schemas.common import InputModel
from app.schemas.orders import AdminOrderOut, OrderOut
from app.schemas.payments import AdminPaymentOut, PaymentConfirm, PaymentReject, PaymentRefund, PaymentReview
from app.services import audit, inventory, orders, payments, subscriptions

router = APIRouter(tags=["admin: ventas y pagos"])


class OrderCancel(InputModel):
    reason: str = Field(min_length=3, max_length=500)


def _present_order(order: Order) -> dict:
    return {
        **OrderOut.model_validate(order).model_dump(),
        "user_id": order.user_id,
        "customer_email": order.user.email if order.user else None,
        "customer_name": order.user.full_name if order.user else None,
    }


def present_payment(p: Payment, db: Session | None = None) -> dict:
    request = p.subscription_request
    sub = (
        subscriptions.get_user_subscription(db, p.user_id)
        if db is not None and request is not None and p.status == PaymentStatus.confirmed
        else None
    )
    return {
        "id": p.id,
        "kind": p.kind,
        "status": p.status,
        "amount": p.amount,
        "method": p.method,
        "operation_reference": p.operation_reference,
        "created_at": p.created_at,
        "decided_at": p.decided_at,
        "user_id": p.user_id,
        "customer_email": p.user.email,
        "customer_name": p.user.full_name,
        "customer_phone": p.user.phone,
        "order_id": p.order_id,
        "subscription_request_id": p.subscription_request_id,
        "plan_name": request.plan.name if request else None,
        "subscription_ends_at": sub.ends_at if sub else None,
        "external_reference": p.external_reference,
        "admin_notes": p.admin_notes,
        "decided_by": p.decided_by,
        "decided_by_email": p.decided_by_profile.email if p.decided_by_profile else None,
        "reservation_expires_at": p.order.reservation_expires_at if p.order else None,
        "reservation_status": p.order.reservation_status if p.order else None,
    }


def _load_payment(db: DbSession, payment_id: uuid.UUID) -> dict:
    payment = db.scalars(
        payments.payment_query().where(Payment.id == payment_id).execution_options(populate_existing=True)
    ).one_or_none()
    if payment is None:
        raise not_found("El pago no existe.")
    return present_payment(payment, db)


# --- Pedidos ---


@router.get("/orders", response_model=list[AdminOrderOut])
def list_orders(
    _: AdminUser,
    db: DbSession,
    status: Annotated[OrderStatus | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=40)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    stmt = select(Order).options(selectinload(Order.items), selectinload(Order.payment), selectinload(Order.user))
    if status:
        stmt = stmt.where(Order.status == status)
    if q:
        stmt = stmt.where(Order.reference.ilike(f"%{q.strip()}%"))
    rows = db.scalars(stmt.order_by(Order.created_at.desc()).limit(limit).offset(offset))
    return [_present_order(o) for o in rows]


@router.post("/orders/expire-reservations", response_model=ExpiredSweepResult)
def expire_reservations(admin: AdminUser, db: DbSession):
    count = inventory.expire_stale_reservations(db, clock.now(), limit=500)
    if count:
        audit.record(db, admin, "order.expire_reservations", "order", "*", {"expired_orders": count})
    db.commit()
    return {"expired_orders": count}


@router.post("/orders/{order_id}/renew-reservation", response_model=AdminOrderOut)
def renew_reservation(order_id: uuid.UUID, admin: AdminUser, db: DbSession):
    order = orders.admin_renew_reservation(db, order_id, admin, clock.now())
    db.commit()
    db.refresh(order)
    return _present_order(order)


@router.post("/orders/{order_id}/cancel", response_model=AdminOrderOut)
def cancel_order(order_id: uuid.UUID, data: OrderCancel, admin: AdminUser, db: DbSession):
    order = orders.admin_cancel_order(db, order_id, admin, clock.now(), data.reason)
    db.commit()
    db.refresh(order)
    return _present_order(order)


# --- Pagos ---


@router.get("/payments", response_model=list[AdminPaymentOut])
def list_payments(
    _: AdminUser,
    db: DbSession,
    status: Annotated[list[PaymentStatus] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    stmt = payments.payment_query()
    if status:
        stmt = stmt.where(Payment.status.in_(status))
    rows = db.scalars(stmt.order_by(Payment.created_at.desc()).limit(limit).offset(offset))
    return [present_payment(p, db) for p in rows]


@router.post("/payments/{payment_id}/review", response_model=AdminPaymentOut)
def review_payment(payment_id: uuid.UUID, data: PaymentReview, admin: AdminUser, db: DbSession):
    payments.mark_in_review(db, payment_id, admin, data)
    db.commit()
    return _load_payment(db, payment_id)


@router.post("/payments/{payment_id}/confirm", response_model=AdminPaymentOut)
def confirm_payment(payment_id: uuid.UUID, data: PaymentConfirm, admin: AdminUser, db: DbSession):
    payments.confirm(db, payment_id, admin, data, clock.now())
    db.commit()
    return _load_payment(db, payment_id)


@router.post("/payments/{payment_id}/reject", response_model=AdminPaymentOut)
def reject_payment(payment_id: uuid.UUID, data: PaymentReject, admin: AdminUser, db: DbSession):
    payments.reject(db, payment_id, admin, data, clock.now())
    db.commit()
    return _load_payment(db, payment_id)


@router.post("/payments/{payment_id}/refund", response_model=AdminPaymentOut)
def refund_payment(payment_id: uuid.UUID, data: PaymentRefund, admin: AdminUser, db: DbSession):
    payments.refund(db, payment_id, admin, data, clock.now())
    db.commit()
    return _load_payment(db, payment_id)
