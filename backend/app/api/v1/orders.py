import logging

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession, rate_limited
from app.core import clock
from app.schemas.orders import OrderCreate, OrderCreated, OrderOut
from app.services import inventory, orders, whatsapp

router = APIRouter(prefix="/orders", tags=["pedidos"])
logger = logging.getLogger("s2fit")


@router.post("", response_model=OrderCreated, status_code=status.HTTP_201_CREATED,
             dependencies=[rate_limited("orders")])
def create_order(data: OrderCreate, user: CurrentUser, db: DbSession):
    now = clock.now()
    # Sin tareas programadas en el plan gratuito: las reservas vencidas se liberan aquí,
    # en una transacción corta e independiente, antes de calcular la disponibilidad.
    try:
        inventory.expire_stale_reservations(db, now, limit=50)
        db.commit()
    except Exception:  # noqa: BLE001 - la limpieza es oportunista; no debe impedir la compra
        db.rollback()
        logger.exception("No se pudieron liberar reservas vencidas")

    order = orders.create_order(db, user, data, now)
    db.commit()
    return {**OrderOut.model_validate(order).model_dump(), "whatsapp_message": whatsapp.order_message(order)}


@router.get("", response_model=list[OrderOut])
def list_my_orders(user: CurrentUser, db: DbSession):
    return orders.list_user_orders(db, user)


@router.get("/{reference}", response_model=OrderCreated)
def get_my_order(reference: str, user: CurrentUser, db: DbSession):
    order = orders.get_user_order(db, user, reference)
    return {**OrderOut.model_validate(order).model_dump(), "whatsapp_message": whatsapp.order_message(order)}


@router.post("/{reference}/cancel", response_model=OrderOut)
def cancel_my_order(reference: str, user: CurrentUser, db: DbSession):
    order = orders.cancel_user_order(db, user, reference, clock.now())
    db.commit()
    return order
