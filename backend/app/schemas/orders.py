import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import InputModel, ORMModel


class OrderLineIn(InputModel):
    # Solo se reciben la variante y la cantidad: el precio lo calcula el servidor.
    variant_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=10)


class OrderCreate(InputModel):
    items: list[OrderLineIn] = Field(min_length=1, max_length=20)
    customer_note: str | None = Field(default=None, max_length=500)


class OrderItemOut(ORMModel):
    variant_id: int
    product_name: str
    variant_label: str
    sku: str
    unit_price: int
    quantity: int
    line_total: int


class OrderPaymentOut(ORMModel):
    status: str
    amount: int | None
    method: str | None
    decided_at: datetime | None


class OrderOut(ORMModel):
    id: uuid.UUID
    reference: str
    status: str
    subtotal: int
    total: int
    reservation_status: str
    reservation_expires_at: datetime
    customer_note: str | None
    created_at: datetime
    paid_at: datetime | None
    cancelled_at: datetime | None
    items: list[OrderItemOut]
    payment: OrderPaymentOut | None


class OrderCreated(OrderOut):
    whatsapp_message: str


class AdminOrderOut(OrderOut):
    user_id: uuid.UUID
    customer_email: str | None = None
    customer_name: str | None = None
