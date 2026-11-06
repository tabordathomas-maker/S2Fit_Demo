import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import InputModel, ORMModel


class BoxClaimCreate(InputModel):
    customer_note: str | None = Field(default=None, max_length=500)


class BoxClaimDecision(InputModel):
    admin_notes: str | None = Field(default=None, max_length=500)


class BoxClaimOut(ORMModel):
    id: uuid.UUID
    reference: str
    status: str
    box_id: int | None
    box_title: str | None
    customer_note: str | None
    admin_notes: str | None
    decided_at: datetime | None
    created_at: datetime


class BoxClaimCreated(BoxClaimOut):
    whatsapp_message: str
    already_existed: bool


class AdminBoxClaimOut(BoxClaimOut):
    user_id: uuid.UUID
    customer_email: str | None
    customer_name: str | None
    customer_phone: str | None
