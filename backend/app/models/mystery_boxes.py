from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, enum_check
from app.models.enums import AccessLevel


class MysteryBox(TimestampMixin, Base):
    """Caja misteriosa de S2 Box: la portada es pública; el contenido solo sale por la API tras verificar el acceso."""

    __tablename__ = "mystery_boxes"
    __table_args__ = (enum_check("content_access", AccessLevel),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # --- Portada (pública) ---
    title: Mapped[str] = mapped_column(String(120))
    teaser: Mapped[str | None] = mapped_column(String(300))
    cover_url: Mapped[str] = mapped_column(Text)
    cover_alt: Mapped[str | None] = mapped_column(String(200))
    # --- Contenido (protegido) ---
    content_media_url: Mapped[str | None] = mapped_column(Text)
    content_description: Mapped[str] = mapped_column(Text)
    # plus = solo membresía S2 Box activa; free = cualquier persona.
    content_access: Mapped[str] = mapped_column(String(10), default=AccessLevel.plus, server_default=AccessLevel.plus.value)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Eliminación lógica: tiene reclamos, así que se oculta en vez de borrarse.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
