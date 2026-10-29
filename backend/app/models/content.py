from sqlalchemy import Boolean, Integer, String, Text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, enum_check
from app.models.enums import AccessLevel, ContentKind


class ContentItem(TimestampMixin, Base):
    """Rutinas, recetas, crecimiento personal e ideas de alimentación (gratis o S2 Plus)."""

    __tablename__ = "content_items"
    __table_args__ = (enum_check("kind", ContentKind), enum_check("access", AccessLevel))

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str | None] = mapped_column(String(300))
    # Texto e enlace multimedia: solo se entregan si la persona tiene acceso.
    body: Mapped[str | None] = mapped_column(Text)
    media_url: Mapped[str | None] = mapped_column(String(500))
    meta: Mapped[str | None] = mapped_column(String(80))
    meal_slot: Mapped[str | None] = mapped_column(String(20))
    access: Mapped[str] = mapped_column(String(10), default=AccessLevel.free)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
