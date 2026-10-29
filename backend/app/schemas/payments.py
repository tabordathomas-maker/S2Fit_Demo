import uuid
from datetime import datetime

from pydantic import Field

from app.models.enums import PaymentMethod
from app.schemas.common import InputModel, ORMModel


class PaymentOut(ORMModel):
    id: uuid.UUID
    kind: str
    status: str
    amount: int | None
    method: str | None
    operation_reference: str
    created_at: datetime
    decided_at: datetime | None


class AdminPaymentOut(PaymentOut):
    user_id: uuid.UUID
    customer_email: str | None
    customer_name: str | None
    customer_phone: str | None
    order_id: uuid.UUID | None
    subscription_request_id: uuid.UUID | None
    plan_name: str | None
    external_reference: str | None
    admin_notes: str | None
    decided_by: uuid.UUID | None
    decided_by_email: str | None
    reservation_expires_at: datetime | None
    reservation_status: str | None


class PaymentReview(InputModel):
    """Marca el pago como "en revisión" y registra datos mientras se verifica."""

    method: PaymentMethod | None = None
    admin_notes: str | None = Field(default=None, max_length=2000)


class PaymentConfirm(InputModel):
    # El administrador repite la referencia y el importe verificados en el convenio;
    # el servidor los compara con la operación antes de aplicar cualquier efecto.
    operation_reference: str = Field(min_length=6, max_length=24)
    amount: int = Field(gt=0, le=50_000_000)
    method: PaymentMethod
    external_reference: str = Field(min_length=3, max_length=100)
    admin_notes: str | None = Field(default=None, max_length=2000)


class PaymentReject(InputModel):
    admin_notes: str = Field(min_length=3, max_length=2000)


class PaymentRefund(InputModel):
    admin_notes: str = Field(min_length=3, max_length=2000)
