"""Reservas y movimientos de inventario.

Estrategia:
- Crear pedido: se bloquean las variantes (SELECT ... FOR UPDATE, en orden de id para
  evitar interbloqueos), se comprueba stock_on_hand - stock_reserved y se suma la
  cantidad a stock_reserved.
- Cancelar/expirar: se resta de stock_reserved.
- Confirmar pago: se resta de stock_on_hand y de stock_reserved (salida definitiva).
- orders.reservation_status (active → released | consumed) impide liberar o
  descontar la misma reserva dos veces.

Orden de bloqueo en todo el sistema: pedido → pago → variantes.
"""

import uuid
from collections.abc import Iterable
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import get_settings
from app.core.errors import conflict, not_found
from app.models import InventoryMovement, Order, Profile, ProductVariant
from app.models.enums import MovementKind, OrderStatus, ReservationStatus


def lock_variants(db: Session, variant_ids: Iterable[int]) -> dict[int, ProductVariant]:
    stmt = (
        select(ProductVariant)
        .where(ProductVariant.id.in_(sorted(set(variant_ids))))
        .order_by(ProductVariant.id)
        .options(joinedload(ProductVariant.product))
        .with_for_update(of=ProductVariant)
        .execution_options(populate_existing=True)
    )
    return {v.id: v for v in db.scalars(stmt).unique()}


def reservation_deadline(now: datetime) -> datetime:
    return now + timedelta(minutes=get_settings().reservation_ttl_minutes)


def _movement(db: Session, variant_id: int, kind: MovementKind, quantity: int, order: Order | None,
              actor_id: uuid.UUID | None, note: str | None = None) -> None:
    db.add(InventoryMovement(variant_id=variant_id, order_id=order.id if order else None, kind=kind,
                             quantity=quantity, created_by=actor_id, note=note))


def reserve_items(db: Session, order: Order, locked: dict[int, ProductVariant], actor_id: uuid.UUID | None) -> None:
    for item in order.items:
        variant = locked[item.variant_id]
        if variant.available < item.quantity:
            raise conflict(
                "insufficient_stock",
                f"Solo quedan {max(variant.available, 0)} unidades de {variant.product.name} ({variant.label}).",
                {"variant_id": variant.id, "available": max(variant.available, 0)},
            )
        variant.stock_reserved += item.quantity
        _movement(db, variant.id, MovementKind.reserve, item.quantity, order, actor_id)
    order.reservation_status = ReservationStatus.active


def _release_locked(db: Session, order: Order, locked: dict[int, ProductVariant], actor_id: uuid.UUID | None, note: str) -> None:
    for item in order.items:
        locked[item.variant_id].stock_reserved -= item.quantity
        _movement(db, item.variant_id, MovementKind.release, -item.quantity, order, actor_id, note)
    order.reservation_status = ReservationStatus.released


def release_reservation(db: Session, order: Order, actor_id: uuid.UUID | None, note: str) -> bool:
    """Libera la reserva de un pedido ya bloqueado. Devuelve False si no había reserva activa."""
    if order.reservation_status != ReservationStatus.active:
        return False
    locked = lock_variants(db, (i.variant_id for i in order.items))
    _release_locked(db, order, locked, actor_id, note)
    return True


def consume_reservation(db: Session, order: Order, actor_id: uuid.UUID) -> None:
    """Convierte la reserva en salida definitiva (pago confirmado)."""
    if order.reservation_status != ReservationStatus.active:
        raise conflict("reservation_not_active", "El pedido no tiene una reserva activa de inventario.")
    locked = lock_variants(db, (i.variant_id for i in order.items))
    for item in order.items:
        variant = locked[item.variant_id]
        variant.stock_on_hand -= item.quantity
        variant.stock_reserved -= item.quantity
        _movement(db, variant.id, MovementKind.sale, -item.quantity, order, actor_id)
    order.reservation_status = ReservationStatus.consumed


def renew_reservation(db: Session, order: Order, actor_id: uuid.UUID, now: datetime) -> None:
    """Vuelve a reservar (o extiende) el inventario de un pedido pendiente o expirado."""
    if order.reservation_status == ReservationStatus.consumed:
        raise conflict("reservation_consumed", "Este pedido ya descontó su inventario.")
    if order.reservation_status == ReservationStatus.released:
        locked = lock_variants(db, (i.variant_id for i in order.items))
        reserve_items(db, order, locked, actor_id)
    order.reservation_expires_at = reservation_deadline(now)
    order.status = OrderStatus.pending_payment


def expire_stale_reservations(db: Session, now: datetime, limit: int = 100) -> int:
    """Libera las reservas vencidas y marca esos pedidos como expirados.

    Primero se bloquean los pedidos (saltando los que otra transacción esté usando) y
    luego todas sus variantes de una sola vez y en orden, para no generar interbloqueos.
    """
    orders = db.scalars(
        select(Order)
        .where(
            Order.status == OrderStatus.pending_payment,
            Order.reservation_status == ReservationStatus.active,
            Order.reservation_expires_at < now,
        )
        .order_by(Order.reservation_expires_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
        .options(selectinload(Order.items))
        .execution_options(populate_existing=True)
    ).all()
    if not orders:
        return 0
    locked = lock_variants(db, (i.variant_id for o in orders for i in o.items))
    for order in orders:
        _release_locked(db, order, locked, None, "Reserva expirada")
        order.status = OrderStatus.expired
    return len(orders)


def adjust_stock(db: Session, variant_id: int, delta: int, note: str, admin: Profile) -> ProductVariant:
    locked = lock_variants(db, [variant_id])
    variant = locked.get(variant_id)
    if variant is None:
        raise not_found("La variante no existe.")
    new_on_hand = variant.stock_on_hand + delta
    if new_on_hand < variant.stock_reserved:
        raise conflict(
            "stock_below_reserved",
            f"No puedes dejar menos de {variant.stock_reserved} unidades: están reservadas por pedidos pendientes.",
        )
    variant.stock_on_hand = new_on_hand
    _movement(db, variant.id, MovementKind.adjustment, delta, None, admin.id, note)
    return variant
