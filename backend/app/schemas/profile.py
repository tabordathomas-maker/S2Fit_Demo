import uuid
from datetime import datetime

from pydantic import Field, field_validator

from app.core.phones import normalize_co_mobile
from app.schemas.common import InputModel, ORMModel


class ProfileOut(ORMModel):
    id: uuid.UUID
    email: str | None
    full_name: str | None
    phone: str | None
    role: str
    created_at: datetime


class ProfileUpdate(InputModel):
    # El rol no está aquí a propósito: nunca se modifica desde el cliente.
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, value: str | None) -> str | None:
        return normalize_co_mobile(value)
