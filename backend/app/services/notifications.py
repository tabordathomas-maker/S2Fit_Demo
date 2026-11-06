"""Notificaciones derivadas de los datos existentes (sin tabla propia).

La fecha de cada evento sale de campos explícitos (paid_at, cancelled_at, decided_at,
created_at...) y no de updated_at: ese campo usa la hora de la base de datos
(onupdate=func.now()), no clock.now(), y con la hora simulada de las pruebas no coincidiría.
"""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BoxClaim, Order, Payment, Profile, SubscriptionRequest
from app.models.enums import BoxClaimStatus, OrderStatus, SubscriptionRequestStatus
from app.schemas.notifications import NotificationFeed, NotificationItem

MAX_ITEMS = 30
FIRST_VISIT_WINDOW = timedelta(days=7)

# estado interno -> (estado del feed, etiqueta)
ORDER_STATES = {
    OrderStatus.pending_payment: ("pending", "Pendiente"),
    OrderStatus.paid: ("accepted", "Aceptado"),
    OrderStatus.cancelled: ("rejected", "Cancelado"),
    OrderStatus.expired: ("rejected", "Vencido"),
    OrderStatus.refunded: ("rejected", "Reembolsado"),
}
SUBSCRIPTION_STATES = {
    SubscriptionRequestStatus.pending_payment: ("pending", "Pendiente"),
    SubscriptionRequestStatus.paid: ("accepted", "Aceptado"),
    SubscriptionRequestStatus.rejected: ("rejected", "Rechazado"),
    SubscriptionRequestStatus.cancelled: ("rejected", "Cancelado"),
}
CLAIM_STATES = {
    BoxClaimStatus.pending: ("pending", "Pendiente"),
    BoxClaimStatus.accepted: ("accepted", "Aceptado"),
    BoxClaimStatus.rejected: ("rejected", "Rechazado"),
}


def _order_time(order: Order, payment_decided_at: datetime | None) -> datetime:
    when = {
        OrderStatus.paid: order.paid_at,
        OrderStatus.cancelled: order.cancelled_at,
        OrderStatus.expired: order.reservation_expires_at,
        OrderStatus.refunded: payment_decided_at,
    }.get(order.status)
    return when or order.created_at


def _subscription_time(request: SubscriptionRequest, payment_decided_at: datetime | None) -> datetime:
    if request.status == SubscriptionRequestStatus.pending_payment:
        return request.created_at
    return payment_decided_at or request.created_at


def _claim_time(claim: BoxClaim) -> datetime:
    return claim.created_at if claim.status == BoxClaimStatus.pending else (claim.decided_at or claim.created_at)


def _threshold(user: Profile, now: datetime) -> datetime:
    return user.notifications_seen_at or (now - FIRST_VISIT_WINDOW)


def _customer_feed(db: Session, user: Profile, now: datetime) -> list[NotificationItem]:
    since = _threshold(user, now)
    items: list[NotificationItem] = []

    # Se lee un poco más de lo que se muestra por tipo; la lista final se ordena por la fecha del evento.
    orders = db.execute(
        select(Order, Payment.decided_at)
        .outerjoin(Payment, Payment.order_id == Order.id)
        .where(Order.user_id == user.id)
        .order_by(Order.updated_at.desc())
        .limit(MAX_ITEMS)
    ).all()
    for order, decided_at in orders:
        status, label = ORDER_STATES[order.status]
        when = _order_time(order, decided_at)
        items.append(NotificationItem(
            id=f"order:{order.reference}", kind="order", reference=order.reference, title="Pedido",
            status=status, status_label=label, occurred_at=when, link="/pedidos",
            unread=status != "pending" and when > since,
        ))

    requests = db.execute(
        select(SubscriptionRequest, Payment.decided_at)
        .outerjoin(Payment, Payment.subscription_request_id == SubscriptionRequest.id)
        .where(SubscriptionRequest.user_id == user.id)
        .order_by(SubscriptionRequest.updated_at.desc())
        .limit(MAX_ITEMS)
    ).all()
    for request, decided_at in requests:
        status, label = SUBSCRIPTION_STATES[request.status]
        when = _subscription_time(request, decided_at)
        items.append(NotificationItem(
            id=f"subscription:{request.reference}", kind="subscription", reference=request.reference,
            title="Solicitud de membresía", status=status, status_label=label, occurred_at=when,
            link="/s2-box", unread=status != "pending" and when > since,
        ))

    claims = db.scalars(
        select(BoxClaim).where(BoxClaim.user_id == user.id).order_by(BoxClaim.updated_at.desc()).limit(MAX_ITEMS)
    ).all()
    for claim in claims:
        status, label = CLAIM_STATES[claim.status]
        when = _claim_time(claim)
        items.append(NotificationItem(
            id=f"box_claim:{claim.reference}", kind="box_claim", reference=claim.reference,
            title="Reclamo de S2 Box", status=status, status_label=label, occurred_at=when,
            link="/s2-box", unread=status != "pending" and when > since,
        ))
    return items


def _admin_feed(db: Session, user: Profile, now: datetime) -> list[NotificationItem]:
    since = _threshold(user, now)
    items: list[NotificationItem] = []

    orders = db.scalars(
        select(Order).where(Order.status == OrderStatus.pending_payment).order_by(Order.created_at.desc()).limit(MAX_ITEMS)
    ).all()
    for order in orders:
        items.append(NotificationItem(
            id=f"order:{order.reference}", kind="order", reference=order.reference, title="Nuevo pedido",
            status="pending", status_label="Pendiente", occurred_at=order.created_at,
            link="/admin?tab=pedidos", unread=order.created_at > since,
        ))

    requests = db.scalars(
        select(SubscriptionRequest)
        .where(SubscriptionRequest.status == SubscriptionRequestStatus.pending_payment)
        .order_by(SubscriptionRequest.created_at.desc())
        .limit(MAX_ITEMS)
    ).all()
    for request in requests:
        items.append(NotificationItem(
            id=f"subscription:{request.reference}", kind="subscription", reference=request.reference,
            title="Nueva solicitud de membresía", status="pending", status_label="Pendiente",
            occurred_at=request.created_at, link="/admin?tab=pagos", unread=request.created_at > since,
        ))

    claims = db.scalars(
        select(BoxClaim).where(BoxClaim.status == BoxClaimStatus.pending).order_by(BoxClaim.created_at.desc()).limit(MAX_ITEMS)
    ).all()
    for claim in claims:
        items.append(NotificationItem(
            id=f"box_claim:{claim.reference}", kind="box_claim", reference=claim.reference,
            title="Nuevo reclamo de S2 Box", status="pending", status_label="Pendiente",
            occurred_at=claim.created_at, link="/admin?tab=s2box", unread=claim.created_at > since,
        ))
    return items


def feed_for(db: Session, user: Profile, now: datetime) -> NotificationFeed:
    items = _admin_feed(db, user, now) if user.is_admin else _customer_feed(db, user, now)
    items.sort(key=lambda item: item.occurred_at, reverse=True)
    items = items[:MAX_ITEMS]
    return NotificationFeed(items=items, unread_count=sum(item.unread for item in items))


def mark_seen(user: Profile, now: datetime) -> None:
    user.notifications_seen_at = now
