from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, Field, field_validator

from app.core.phones import normalize_co_mobile
from app.schemas.common import InputModel, ORMModel

AccessSource = Literal["order", "code", "admin", "membership"]


class CodeInput(InputModel):
    code: str = Field(max_length=40)


class AccessOut(ORMModel):
    has_access: bool
    source: str | None = None


class AccessCodeCreate(InputModel):
    quantity: int = Field(default=1, ge=1, le=50)
    note: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    expires_at: AwareDatetime | None = None

    @field_validator("note")
    @classmethod
    def _blank_note(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, value: str | None) -> str | None:
        return normalize_co_mobile(value)


class AccessCodeUpdate(InputModel):
    is_active: bool | None = None
    note: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    expires_at: AwareDatetime | None = None

    @field_validator("note")
    @classmethod
    def _blank_note(cls, value: str | None) -> str | None:
        return value or None

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, value: str | None) -> str | None:
        return normalize_co_mobile(value)


class AccessCodeOut(ORMModel):
    id: int
    code: str
    note: str | None
    phone: str | None
    is_active: bool
    expires_at: datetime | None
    used_count: int
    last_used_at: datetime | None
    created_at: datetime
    status: Literal["active", "inactive", "expired"]
    linked_email: str | None = None
    linked_name: str | None = None


class MiRutaToggle(InputModel):
    enabled: bool
