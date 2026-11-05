"""Uso vigente e histórico de planes, productos y variantes (consultas agrupadas, sin N+1)."""

from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Order, OrderItem, ProductVariant, Subscription, SubscriptionRenewal, SubscriptionRequest
from app.models.enums import OrderStatus, ReservationStatus, SubscriptionRequestStatus, SubscriptionStatus


def _clean(counts: dict[str, int]) -> dict[str, int]:
    return {k: v for k, v in counts.items() if v}


def plan_usage(db: Session, plan_ids: Iterable[int], now: datetime) -> dict[int, dict]:
    """Vigente: suscripción activa (con vencimiento futuro) o esperando pago, y solicitud esperando pago.
    Histórico: todo lo demás (vencidas, canceladas, rechazadas y renovaciones)."""
    ids = list(plan_ids)
    live: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    hist: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for plan_id, status, ends_at in db.execute(
        select(Subscription.plan_id, Subscription.status, Subscription.ends_at).where(Subscription.plan_id.in_(ids))
    ):
        if status == SubscriptionStatus.active and ends_at is not None and ends_at > now:
            live[plan_id]["subscriptions_active"] += 1
        elif status == SubscriptionStatus.pending_payment:
            live[plan_id]["subscriptions_pending"] += 1
        else:
            hist[plan_id]["subscriptions"] += 1
    for plan_id, status, count in db.execute(
        select(SubscriptionRequest.plan_id, SubscriptionRequest.status, func.count())
        .where(SubscriptionRequest.plan_id.in_(ids)).group_by(SubscriptionRequest.plan_id, SubscriptionRequest.status)
    ):
        if status == SubscriptionRequestStatus.pending_payment:
            live[plan_id]["requests_pending"] += count
        else:
            hist[plan_id]["requests"] += count
    for plan_id, count in db.execute(
        select(SubscriptionRenewal.plan_id, func.count()).where(SubscriptionRenewal.plan_id.in_(ids)).group_by(SubscriptionRenewal.plan_id)
    ):
        hist[plan_id]["renewals"] += count
    return {pid: {"live": _clean(live[pid]), "historical": _clean(hist[pid])} for pid in ids}


def _orders_by_variant(db: Session, variant_ids: list[int]) -> dict[int, dict]:
    """variant_id -> {order_id: es_vigente}. Vigente: pedido esperando pago con reserva activa."""
    result: dict[int, dict] = defaultdict(dict)
    rows = db.execute(
        select(OrderItem.variant_id, Order.id, (Order.status == OrderStatus.pending_payment) & (Order.reservation_status == ReservationStatus.active))
        .join(Order, Order.id == OrderItem.order_id)
        .where(OrderItem.variant_id.in_(variant_ids))
        .distinct()
    )
    for variant_id, order_id, is_live in rows:
        result[variant_id][order_id] = bool(is_live)
    return result


def _summarize(orders: dict) -> dict:
    live = sum(1 for is_live in orders.values() if is_live)
    return {"live": _clean({"orders_pending": live}), "historical": _clean({"orders": len(orders) - live})}


def variant_usage(db: Session, variant_ids: Iterable[int]) -> dict[int, dict]:
    ids = list(variant_ids)
    by_variant = _orders_by_variant(db, ids)
    return {vid: _summarize(by_variant.get(vid, {})) for vid in ids}


def product_usage(db: Session, product_ids: Iterable[int]) -> dict[int, dict]:
    ids = list(product_ids)
    variants = db.execute(select(ProductVariant.id, ProductVariant.product_id).where(ProductVariant.product_id.in_(ids))).all()
    by_variant = _orders_by_variant(db, [v for v, _ in variants])
    merged: dict[int, dict] = defaultdict(dict)
    for variant_id, product_id in variants:
        merged[product_id].update(by_variant.get(variant_id, {}))
    return {pid: _summarize(merged.get(pid, {})) for pid in ids}


def in_use(usage: dict) -> bool:
    return bool(usage["live"])
