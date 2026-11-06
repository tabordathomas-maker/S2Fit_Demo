from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import InputModel, ORMModel

Access = Literal["free", "plus"]


class MysteryBoxPublic(ORMModel):
    """Solo la portada: el contenido nunca viaja en la lista pública."""

    id: int
    title: str
    teaser: str | None
    cover_url: str
    cover_alt: str | None
    content_access: Access


class MysteryBoxContent(ORMModel):
    id: int
    title: str
    content_media_url: str | None
    content_description: str
    content_access: Access


class AdminMysteryBoxOut(ORMModel):
    id: int
    title: str
    teaser: str | None
    cover_url: str
    cover_alt: str | None
    content_media_url: str | None
    content_description: str
    content_access: Access
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class MysteryBoxCreate(InputModel):
    title: str = Field(min_length=2, max_length=120)
    teaser: str | None = Field(default=None, max_length=300)
    cover_url: str = Field(max_length=1000, pattern=r"^https://")
    cover_alt: str | None = Field(default=None, max_length=200)
    content_media_url: str | None = Field(default=None, max_length=1000, pattern=r"^https://")
    content_description: str = Field(min_length=1, max_length=20000)
    content_access: Access = "plus"
    is_active: bool = True
    sort_order: int = Field(default=0, ge=0)


class MysteryBoxUpdate(InputModel):
    title: str | None = Field(default=None, min_length=2, max_length=120)
    teaser: str | None = Field(default=None, max_length=300)
    cover_url: str | None = Field(default=None, max_length=1000, pattern=r"^https://")
    cover_alt: str | None = Field(default=None, max_length=200)
    content_media_url: str | None = Field(default=None, max_length=1000, pattern=r"^https://")
    content_description: str | None = Field(default=None, min_length=1, max_length=20000)
    content_access: Access | None = None
    is_active: bool | None = None
    sort_order: int | None = Field(default=None, ge=0)
