from datetime import datetime

from pydantic import Field

from app.schemas.common import InputModel, ORMModel


class BoxImageOut(ORMModel):
    id: int
    url: str
    alt_text: str | None
    sort_order: int


class AdminBoxImageOut(BoxImageOut):
    is_active: bool
    created_at: datetime
    updated_at: datetime


class BoxImageCreate(InputModel):
    url: str = Field(max_length=1000, pattern=r"^https://")
    alt_text: str | None = Field(default=None, max_length=200)
    sort_order: int = Field(default=0, ge=0)
    is_active: bool = True


class BoxImageUpdate(InputModel):
    url: str | None = Field(default=None, max_length=1000, pattern=r"^https://")
    alt_text: str | None = Field(default=None, max_length=200)
    sort_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None
