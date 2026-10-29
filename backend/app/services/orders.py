import uuid
from collections import defaultdict
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, conflict, not_found
from app.core.references import new_reference
from app.models import Order, OrderItem, Payment, Profile
from app.models.enums import OrderStatus, PaymentKind, PaymentStatus, ReservationStatus
from app.schemas.orders import OrderCreate
from app.services import audit, inventory

MAX_UNITS_PER_VARIANT = 10
OPEN_PAYMENT_STATUSES = {PaymentStatus.pending, PaymentStatus.in_review}


def _order_query():
    return select(Order).options(selectinload(Order.items), selectinload(Order.payment))


def lock_order(db: Session, order_id: uuid.UUID) -> Order:
    order = db.scalars(
        _order_query().where(Order.id == order_id).with_for_update(of=Order).execution_options(populate_existing=True)
    ).one_or_none()
    if order is None:
        raise not_found("El pedido no existe.")
    return order


def create_order(db: Session, user: Profile, data: OrderCreate, now: datetime) -> Order:
    quantities: dict[int, int] = defaultdict(int)
    for line in data.items:
        quantities[line.variant_id] += line.quantity
    if any(q > MAX_UNITS_PER_VARIANT for q in quantities.values()):
        raise AppError(422, "quantity_limit", f"Puedes pedir máximo {MAX_UNITS_PER_VARIANT} unidades por variante.")

    locked = inventory.lock_variants(db, quantities)
    missing = [vid for vid in quantities if vid not in locked]
    if missing:
        raise AppError(404, "variant_not_found", "Una de las variantes seleccionadas no existe.", {"variant_ids": missing})

    order = Order(
        reference=new_reference("ORD"),
        user_id=user.id,
        status=OrderStatus.pending_payment,
        reservation_status=ReservationStatus.active,
        reservation_expires_at=inventory.reservation_deadline(now),
        customer_note=data.customer_note,
        subtotal=0,
        total=0,
    )
    for variant_id, quantity in quantities.items():
        variant = locked[variant_id]
        if not (variant.is_active and variant.product.is_active):
            raise conflict(
                "variant_unavailable",
                f"{variant.product.name} ({variant.label}) ya no está disponible.",
                {"variant_id": variant.id},
            )
        # El precio siempre sale de la base de datos, nunca del navegador.
        unit_price = variant.unit_price
        order.items.append(
            OrderItem(
                variant_id=variant.id,
                product_name=variant.product.name,
                variant_label=variant.label,
                sku=variant.sku,
                unit_price=unit_price,
                quantity=quantity,
                line_total=unit_price * quantity,
            )
        )
    order.subtotal = sum(i.line_total for i in order.items)
    order.total = order.subtotal

    db.add(order)
    db.flush()
    inventory.reserve_items(db, order, locked, user.id)
    db.add(Payment(kind=PaymentKind.order, order_id=order.id, user_id=user.id, amount=order.total,
                   status=PaymentStatus.pending))
    db.flush()
    db.refresh(order)
    return order


def list_user_orders(db: Session, user: Profile) -> list[Order]:
    return list(db.scalars(_order_query().where(Order.user_id == user.id).order_by(Order.created_at.desc())))


def get_user_order(db: Session, user: Profile, reference: str) -> Order:
    order = db.scalars(_order_query().where(Order.reference == reference, Order.user_id == user.id)).one_or_none()
    if order is None:
        # 404 también para pedidos ajenos: no se revela que existen.
        raise not_found("El pedido no existe.")
    return order


def _cancel(db: Session, order: Order, actor: Profile, now: datetime, note: str) -> None:
    if order.status not in (OrderStatus.pending_payment, OrderStatus.expired):
        raise conflict("order_not_cancellable", "Este pedido ya no se puede cancelar.")
    payment = order.payment
    if payment is not None:
        db.refresh(payment, with_for_update=True)
        if payment.status not in OPEN_PAYMENT_STATUSES:
            raise conflict("order_not_cancellable", "Este pedido tiene un pago ya procesado.")
        payment.status = PaymentStatus.cancelled
    inventory.release_reservation(db, order, actor.id, note)
    order.status = OrderStatus.cancelled
    order.cancelled_at = now


def cancel_user_order(db: Session, user: Profile, reference: str, now: datetime) -> Order:
    order = get_user_order(db, user, reference)
    order = lock_order(db, order.id)
    _cancel(db, order, user, now, "Cancelado por el cliente")
    return order


def admin_cancel_order(db: Session, order_id: uuid.UUID, admin: Profile, now: datetime, reason: str) -> Order:
    order = lock_order(db, order_id)
    _cancel(db, order, admin, now, f"Cancelado por administración: {reason}")
    audit.record(db, admin, "order.cancel", "order", order.id, {"reference": order.reference, "reason": reason})
    return order


def admin_renew_reservation(db: Session, order_id: uuid.UUID, admin: Profile, now: datetime) -> Order:
    order = lock_order(db, order_id)
    if order.status not in (OrderStatus.pending_payment, OrderStatus.expired):
        raise conflict("order_not_pending", "Solo se puede renovar la reserva de pedidos pendientes o expirados.")
    inventory.renew_reservation(db, order, admin.id, now)
    audit.record(db, admin, "order.renew_reservation", "order", order.id,
                 {"reference": order.reference, "expires_at": order.reservation_expires_at.isoformat()})
    return order
