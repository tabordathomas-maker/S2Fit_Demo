import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import InputModel, ORMModel


class PlanOut(ORMModel):
    id: int
    code: str
    name: str
    description: str | None
    price: int | None
    duration_days: int
    period_label: str
    benefits: list[str]
    is_active: bool


class PlanCreate(InputModel):
    code: str = Field(pattern=r"^[a-z0-9-]{2,40}$")
    name: str = Field(min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    price: int | None = Field(default=None, gt=0, le=50_000_000)
    duration_days: int = Field(default=30, gt=0, le=3660)
    period_label: str = Field(default="mensual", min_length=2, max_length=40)
    benefits: list[str] = Field(default_factory=list, max_length=20)
    is_active: bool = True
    sort_order: int = 0


class PlanUpdate(InputModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    price: int | None = Field(default=None, gt=0, le=50_000_000)
    clear_price: bool = False
    duration_days: int | None = Field(default=None, gt=0, le=3660)
    period_label: str | None = Field(default=None, min_length=2, max_length=40)
    benefits: list[str] | None = Field(default=None, max_length=20)
    is_active: bool | None = None
    sort_order: int | None = None


class SubscriptionRequestCreate(InputModel):
    plan_code: str = Field(min_length=2, max_length=40)


class SubscriptionRequestOut(ORMModel):
    id: uuid.UUID
    reference: str
    kind: str
    status: str
    plan: PlanOut
    agreed_price: int | None
    agreed_duration_days: int | None
    created_at: datetime


class SubscriptionRequestCreated(SubscriptionRequestOut):
    whatsapp_message: str
    already_existed: bool


class RenewalOut(ORMModel):
    period_start: datetime
    period_end: datetime
    duration_days: int
    amount: int
    created_at: datetime


class SubscriptionOut(ORMModel):
    id: uuid.UUID
    status: str
    plan: PlanOut
    starts_at: datetime | None
    ends_at: datetime | None
    amount_paid: int | None
    last_payment_reference: str | None
    renewals: list[RenewalOut]


class MembershipStatus(ORMModel):
    is_active: bool
    subscription: SubscriptionOut | None
    pending_request: SubscriptionRequestOut | None


class AdminSubscriptionRequestOut(SubscriptionRequestOut):
    user_id: uuid.UUID
    customer_email: str | None
    customer_name: str | None
    payment_id: uuid.UUID | None
    payment_status: str | None


class AdminSubscriptionOut(SubscriptionOut):
    user_id: uuid.UUID
    customer_email: str | None
    customer_name: str | None


class AgreedTerms(InputModel):
    """Precio y vigencia acordados por WhatsApp; deben registrarse antes de confirmar el pago."""

    agreed_price: int = Field(gt=0, le=50_000_000)
    agreed_duration_days: int = Field(gt=0, le=3660)


class SubscriptionCancel(InputModel):
    reason: str = Field(min_length=3, max_length=500)
