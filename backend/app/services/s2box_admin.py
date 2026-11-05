"""Planes, solicitudes y suscripciones de S2 Box: edición, archivado y eliminación desde el panel."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, conflict, not_found
from app.models import Payment, Plan, Profile, Subscription, SubscriptionRenewal, SubscriptionRequest
from app.models.enums import PaymentStatus, SubscriptionRequestStatus, SubscriptionStatus
from app.schemas.subscriptions import PlanUpdate, SubscriptionRequestUpdate, SubscriptionUpdate
from app.services import archive, audit, subscriptions
from app.services.usage import plan_usage


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


def _plural_es(count: int, singular: str, plural_form: str) -> str:
    return f"{count} {singular if count == 1 else plural_form}"


def _join(parts: list[str]) -> str:
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " y " + parts[-1]


def _plan_live_message(db: Session, plan_id: int, live: dict[str, int], now: datetime) -> str:
    parts: list[str] = []
    if live.get("subscriptions_active"):
        n = live["subscriptions_active"]
        ends = list(db.scalars(
            select(Subscription.ends_at).where(Subscription.plan_id == plan_id, Subscription.status == SubscriptionStatus.active,
                                               Subscription.ends_at > now).order_by(Subscription.ends_at)
        ))
        text = _plural_es(n, "suscripción activa", "suscripciones activas")
        if 0 < len(ends) <= 3:
            dates = _join([archive.short_date(e) for e in ends])
            text += f" (vence el {dates})" if n == 1 else f" (vencen el {dates})"
        parts.append(text)
    if live.get("subscriptions_pending"):
        parts.append(_plural_es(live["subscriptions_pending"], "suscripción esperando pago", "suscripciones esperando pago"))
    if live.get("requests_pending"):
        parts.append(_plural_es(live["requests_pending"], "solicitud esperando pago", "solicitudes esperando pago"))
    return f"Este plan tiene {_join(parts)}. Puedes archivarlo para que deje de ofrecerse."


def delete_plan(db: Session, admin: Profile, plan_id: int) -> str:
    plan = get_plan(db, plan_id)
    now = clock.now()
    subscriptions.expire_overdue(db, now)
    usage = plan_usage(db, [plan.id], now)[plan.id]
    return archive.delete_or_soft_delete(
        db, admin, plan, "plan", plan.id, "plan", usage["live"], usage["historical"],
        _plan_live_message(db, plan.id, usage["live"], now) if usage["live"] else "",
    )


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
