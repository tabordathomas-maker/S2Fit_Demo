"""Planes, solicitudes y suscripciones de S2 Box: edición, archivado y eliminación desde el panel."""

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, conflict, not_found
from app.models import Payment, Plan, Profile, Subscription, SubscriptionRenewal, SubscriptionRequest
from app.models.enums import PaymentStatus, SubscriptionRequestStatus, SubscriptionStatus
from app.schemas.subscriptions import PlanUpdate, SubscriptionRequestUpdate, SubscriptionUpdate
from app.services import archive, audit, subscriptions


def get_plan(db: Session, plan_id: int) -> Plan:
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise not_found("El plan no existe.")
    return plan


def update_plan(db: Session, admin: Profile, plan_id: int, data: PlanUpdate) -> Plan:
    plan = get_plan(db, plan_id)
    changes = data.model_dump(exclude_unset=True, exclude={"clear_price"})
    if data.clear_price:
        changes["price"] = None
    archive.apply_update(db, admin, plan, "plan", plan.id, changes)
    return plan


def delete_plan(db: Session, admin: Profile, plan_id: int) -> None:
    plan = get_plan(db, plan_id)
    requests = db.scalar(select(func.count(SubscriptionRequest.id)).where(SubscriptionRequest.plan_id == plan.id)) or 0
    subs = db.scalar(select(func.count(Subscription.id)).where(Subscription.plan_id == plan.id)) or 0
    renewals = db.scalar(select(func.count(SubscriptionRenewal.id)).where(SubscriptionRenewal.plan_id == plan.id)) or 0
    archive.block_if_referenced(
        f"Este plan tiene {archive.plural(requests, 'solicitud', 'solicitudes')} y "
        f"{archive.plural(subs, 'suscripción', 'suscripciones')}. Puedes archivarlo para que deje de ofrecerse en S2 Box.",
        {"requests": requests, "subscriptions": subs, "renewals": renewals},
    )
    audit.record(db, admin, "plan.delete", "plan", plan.id, {"code": plan.code, "name": plan.name})
    db.delete(plan)


def _payment_of(db: Session, request_id: uuid.UUID) -> Payment | None:
    return db.scalars(
        select(Payment).where(Payment.subscription_request_id == request_id).with_for_update()
    ).one_or_none()


def update_request(db: Session, admin: Profile, request_id: uuid.UUID, data: SubscriptionRequestUpdate) -> SubscriptionRequest:
    request = subscriptions.lock_request(db, request_id)
    if request.status != SubscriptionRequestStatus.pending_payment:
        raise conflict("REQUEST_LOCKED", "Solo se pueden editar solicitudes pendientes de pago.")
    payment = _payment_of(db, request.id)
    if payment is not None and payment.status not in subscriptions.OPEN_PAYMENT_STATUSES:
        raise conflict("REQUEST_LOCKED", "El pago de esta solicitud ya fue procesado.")
    changes = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    real = archive.apply_update(db, admin, request, "subscription_request", request.id, changes)
    if "agreed_price" in real and payment is not None:
        payment.amount = request.agreed_price
    return request


def delete_request(db: Session, admin: Profile, request_id: uuid.UUID) -> None:
    request = subscriptions.lock_request(db, request_id)
    payment = _payment_of(db, request.id)
    confirmed = payment is not None and payment.status in (PaymentStatus.confirmed, PaymentStatus.refunded)
    if request.status == SubscriptionRequestStatus.paid or confirmed:
        raise conflict("REQUEST_LOCKED", "Solo se eliminan solicitudes pendientes sin pago confirmado.")
    audit.record(db, admin, "subscription_request.delete", "subscription_request", request.id,
                 {"reference": request.reference, "status": request.status})
    if payment is not None:
        db.delete(payment)
        db.flush()
    db.delete(request)


def update_subscription(db: Session, admin: Profile, subscription_id: uuid.UUID, data: SubscriptionUpdate,
                        now: datetime) -> Subscription:
    sub = db.scalars(
        select(Subscription).where(Subscription.id == subscription_id).with_for_update(of=Subscription)
    ).one_or_none()
    if sub is None:
        raise not_found("La suscripción no existe.")
    if sub.status != SubscriptionStatus.active:
        raise conflict("SUBSCRIPTION_LOCKED", "Solo se pueden editar las fechas de una membresía activa.")
    changes = data.model_dump(exclude_unset=True)
    starts = changes.get("starts_at", sub.starts_at)
    ends = changes.get("ends_at", sub.ends_at)
    if starts is None or ends is None or ends <= starts:
        raise AppError(422, "invalid_dates", "La fecha de fin debe ser posterior a la de inicio.")
    archive.apply_update(db, admin, sub, "subscription", sub.id, changes)
    return sub
