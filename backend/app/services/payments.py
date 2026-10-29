"""Verificación manual de pagos por parte de administración.

Cada decisión bloquea primero la operación (pedido o solicitud) y después el pago,
vuelve a comprobar su estado y aplica todos los efectos en la misma transacción. Así
una segunda confirmación (simultánea o posterior) encuentra el pago ya procesado y
no repite efectos.
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import conflict, not_found
from app.models import Order, Payment, Profile, SubscriptionRequest
from app.models.enums import (
    OrderStatus,
    PaymentKind,
    PaymentStatus,
    ReservationStatus,
    SubscriptionRequestStatus,
    SubscriptionStatus,
)
from app.schemas.payments import PaymentConfirm, PaymentReject, PaymentRefund, PaymentReview
from app.services import audit, inventory, orders, subscriptions
from app.services.whatsapp import format_cop

OPEN_STATUSES = {PaymentStatus.pending, PaymentStatus.in_review}


def payment_query():
    return select(Payment).options(
        selectinload(Payment.order).selectinload(Order.items),
        selectinload(Payment.subscription_request).selectinload(SubscriptionRequest.plan),
        selectinload(Payment.user),
        selectinload(Payment.decided_by_profile),
    )


def _get(db: Session, payment_id: uuid.UUID) -> Payment:
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise not_found("El pago no existe.")
    return payment


def _lock(db: Session, payment_id: uuid.UUID) -> Payment:
    return db.scalars(
        select(Payment).where(Payment.id == payment_id).with_for_update().execution_options(populate_existing=True)
    ).one()


def _lock_target(db: Session, payment_id: uuid.UUID) -> tuple[Payment, Order | None, SubscriptionRequest | None]:
    """Bloquea pedido/solicitud y luego el pago (orden de bloqueo común del sistema)."""
    payment = _get(db, payment_id)
    order = orders.lock_order(db, payment.order_id) if payment.kind == PaymentKind.order else None
    request = (
        subscriptions.lock_request(db, payment.subscription_request_id)
        if payment.kind == PaymentKind.subscription
        else None
    )
    return _lock(db, payment_id), order, request


def _ensure_open(payment: Payment) -> None:
    if payment.status not in OPEN_STATUSES:
        raise conflict(
            "payment_already_processed",
            f"Este pago ya fue procesado (estado: {payment.status}). No se aplicó ningún cambio.",
            {"status": payment.status},
        )


def mark_in_review(db: Session, payment_id: uuid.UUID, admin: Profile, data: PaymentReview) -> Payment:
    payment, _, _ = _lock_target(db, payment_id)
    _ensure_open(payment)
    payment.status = PaymentStatus.in_review
    if data.method is not None:
        payment.method = data.method
    if data.admin_notes is not None:
        payment.admin_notes = data.admin_notes
    audit.record(db, admin, "payment.in_review", "payment", payment.id, data.model_dump(exclude_none=True))
    return payment


def confirm(db: Session, payment_id: uuid.UUID, admin: Profile, data: PaymentConfirm, now: datetime) -> Payment:
    payment, order, request = _lock_target(db, payment_id)
    _ensure_open(payment)

    reference = order.reference if order is not None else request.reference
    if data.operation_reference.strip().upper() != reference:
        raise conflict("reference_mismatch", "La referencia indicada no corresponde a esta operación.")

    if request is not None and (request.agreed_price is None or payment.amount is None):
        raise conflict(
            "agreed_terms_missing",
            "Registra el precio y la vigencia acordados con la clienta antes de confirmar el pago.",
        )
    if data.amount != payment.amount:
        raise conflict(
            "amount_mismatch",
            f"El importe recibido ({format_cop(data.amount)}) no coincide con el importe acordado "
            f"({format_cop(payment.amount)}).",
        )

    duplicate = db.scalar(
        select(Payment.id).where(Payment.external_reference == data.external_reference, Payment.id != payment.id)
    )
    if duplicate is not None:
        raise conflict(
            "external_reference_used",
            "Esa referencia del convenio ya se usó para confirmar otro pago.",
        )

    if order is not None:
        if order.status != OrderStatus.pending_payment:
            raise conflict(
                "reservation_expired" if order.status == OrderStatus.expired else "order_not_payable",
                "La reserva de este pedido expiró. Revisa las existencias y renueva la reserva antes de confirmar."
                if order.status == OrderStatus.expired
                else "Este pedido no está pendiente de pago.",
            )
        if order.reservation_status != ReservationStatus.active or order.reservation_expires_at <= now:
            raise conflict(
                "reservation_expired",
                "La reserva de este pedido expiró. Revisa las existencias y renueva la reserva antes de confirmar.",
            )
        inventory.consume_reservation(db, order, admin.id)
        order.status = OrderStatus.paid
        order.paid_at = now
    else:
        if request.status != SubscriptionRequestStatus.pending_payment:
            raise conflict("request_not_pending", "La solicitud de suscripción no está pendiente de pago.")
        payment.external_reference = data.external_reference
        subscriptions.apply_confirmed_payment(db, request, payment, admin, now)

    payment.status = PaymentStatus.confirmed
    payment.method = data.method
    payment.external_reference = data.external_reference
    if data.admin_notes:
        payment.admin_notes = data.admin_notes
    payment.decided_by = admin.id
    payment.decided_at = now
    audit.record(db, admin, "payment.confirm", "payment", payment.id, {
        "operation_reference": reference,
        "amount": data.amount,
        "method": data.method,
        "external_reference": data.external_reference,
    })
    return payment


def reject(db: Session, payment_id: uuid.UUID, admin: Profile, data: PaymentReject, now: datetime) -> Payment:
    payment, order, request = _lock_target(db, payment_id)
    _ensure_open(payment)

    if order is not None:
        inventory.release_reservation(db, order, admin.id, "Pago rechazado")
        if order.status in (OrderStatus.pending_payment, OrderStatus.expired):
            order.status = OrderStatus.cancelled
            order.cancelled_at = now
    else:
        request.status = SubscriptionRequestStatus.rejected
        sub = subscriptions.get_user_subscription(db, request.user_id, lock=True)
        if sub is not None and sub.status == SubscriptionStatus.pending_payment:
            sub.status = SubscriptionStatus.cancelled
            sub.cancelled_at = now

    payment.status = PaymentStatus.rejected
    payment.admin_notes = data.admin_notes
    payment.decided_by = admin.id
    payment.decided_at = now
    audit.record(db, admin, "payment.reject", "payment", payment.id,
                 {"operation_reference": payment.operation_reference, "notes": data.admin_notes})
    return payment


def refund(db: Session, payment_id: uuid.UUID, admin: Profile, data: PaymentRefund, now: datetime) -> Payment:
    """Registra un reembolso hecho por fuera del sistema. El inventario no se repone
    automáticamente: si la prenda vuelve, se registra con un ajuste de existencias."""
    payment, order, request = _lock_target(db, payment_id)
    if payment.status != PaymentStatus.confirmed:
        raise conflict("payment_not_confirmed", "Solo se pueden reembolsar pagos confirmados.")

    if order is not None:
        order.status = OrderStatus.refunded
    else:
        sub = subscriptions.get_user_subscription(db, request.user_id, lock=True)
        if sub is not None and sub.status != SubscriptionStatus.cancelled:
            sub.status = SubscriptionStatus.cancelled
            sub.cancelled_at = now

    payment.status = PaymentStatus.refunded
    payment.admin_notes = ((payment.admin_notes or "") + f"\n[Reembolso] {data.admin_notes}").strip()
    payment.decided_by = admin.id
    payment.decided_at = now
    audit.record(db, admin, "payment.refund", "payment", payment.id,
                 {"operation_reference": payment.operation_reference, "notes": data.admin_notes})
    return payment


def list_user_payments(db: Session, user: Profile) -> list[Payment]:
    return list(db.scalars(payment_query().where(Payment.user_id == user.id).order_by(Payment.created_at.desc())))
