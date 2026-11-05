import re
import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BeforeValidator, Field

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
    hide_price: bool = False
    sort_order: int = 0


class AdminPlanOut(PlanOut):
    """Plan para el panel: incluye si está eliminado y su uso (vigente e histórico)."""

    deleted_at: datetime | None = None
    usage: dict | None = None
    in_use: bool = False


def _clean_name(value: object) -> object:
    # Se normaliza ANTES de validar el largo: «  S2   Box  » cuenta como «S2 Box».
    return re.sub(r"\s+", " ", value).strip() if isinstance(value, str) else value


PlanName = Annotated[str, BeforeValidator(_clean_name), Field(min_length=2, max_length=80)]
Benefit = Annotated[str, Field(min_length=1, max_length=120)]
CODE_PATTERN = r"^[a-z0-9-]{2,40}$"


class PlanCreate(InputModel):
    name: PlanName
    # Opcional: si no viene, se genera a partir del nombre.
    code: str | None = Field(default=None, pattern=CODE_PATTERN)
    description: str | None = Field(default=None, max_length=1000)
    price: int | None = Field(default=None, gt=0, le=50_000_000)
    hide_price: bool = False
    duration_days: int = Field(default=30, ge=1, le=3650)
    period_label: str = Field(default="mensual", min_length=1, max_length=40)
    benefits: list[Benefit] = Field(default_factory=list, max_length=12)
    is_active: bool = True
    sort_order: int = 0


class PlanUpdate(InputModel):
    name: PlanName | None = None
    code: str | None = Field(default=None, pattern=CODE_PATTERN)
    description: str | None = Field(default=None, max_length=1000)
    price: int | None = Field(default=None, gt=0, le=50_000_000)
    clear_price: bool = False
    duration_days: int | None = Field(default=None, ge=1, le=3650)
    period_label: str | None = Field(default=None, min_length=1, max_length=40)
    benefits: list[Benefit] | None = Field(default=None, max_length=12)
    is_active: bool | None = None
    hide_price: bool | None = None
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
    customer_phone: str | None = None


class AgreedTerms(InputModel):
    """Precio y vigencia acordados por WhatsApp; deben registrarse antes de confirmar el pago."""

    agreed_price: int = Field(gt=0, le=50_000_000)
    agreed_duration_days: int = Field(gt=0, le=3660)


class SubscriptionCancel(InputModel):
    reason: str = Field(min_length=3, max_length=500)


class MembershipGrant(InputModel):
    days: int = Field(ge=1, le=3650)
    reason: str = Field(min_length=3, max_length=200)


class MembershipCancel(InputModel):
    reason: str = Field(min_length=3, max_length=200)


class MembershipOut(ORMModel):
    status: str
    plan_name: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    is_active: bool


class SubscriptionRequestUpdate(InputModel):
    """Corrige el precio o la vigencia acordados de una solicitud pendiente."""

    agreed_price: int | None = Field(default=None, gt=0, le=50_000_000)
    agreed_duration_days: int | None = Field(default=None, gt=0, le=3660)


class SubscriptionUpdate(InputModel):
    """Corrige las fechas de una membresía activa."""

    starts_at: datetime | None = None
    ends_at: datetime | None = None
