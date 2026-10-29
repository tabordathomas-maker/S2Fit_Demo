from pydantic import Field

from app.models.enums import AccessLevel, ContentKind
from app.schemas.common import InputModel, ORMModel


class ContentOut(ORMModel):
    id: int
    kind: str
    title: str
    summary: str | None
    meta: str | None
    meal_slot: str | None
    access: str
    locked: bool
    # Solo se rellenan cuando la persona tiene acceso.
    body: str | None = None
    media_url: str | None = None


class AdminContentOut(ORMModel):
    id: int
    kind: str
    title: str
    summary: str | None
    body: str | None
    media_url: str | None
    meta: str | None
    meal_slot: str | None
    access: str
    is_published: bool
    is_demo: bool
    sort_order: int


class ContentCreate(InputModel):
    kind: ContentKind
    title: str = Field(min_length=2, max_length=160)
    summary: str | None = Field(default=None, max_length=300)
    body: str | None = Field(default=None, max_length=20000)
    media_url: str | None = Field(default=None, max_length=500, pattern=r"^https://")
    meta: str | None = Field(default=None, max_length=80)
    meal_slot: str | None = Field(default=None, max_length=20)
    access: AccessLevel = AccessLevel.free
    is_published: bool = True
    sort_order: int = 0


class ContentUpdate(InputModel):
    title: str | None = Field(default=None, min_length=2, max_length=160)
    summary: str | None = Field(default=None, max_length=300)
    body: str | None = Field(default=None, max_length=20000)
    media_url: str | None = Field(default=None, max_length=500, pattern=r"^https://")
    meta: str | None = Field(default=None, max_length=80)
    meal_slot: str | None = Field(default=None, max_length=20)
    access: AccessLevel | None = None
    is_published: bool | None = None
    sort_order: int | None = None
