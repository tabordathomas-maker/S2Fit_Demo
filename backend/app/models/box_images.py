from sqlalchemy import Boolean, Integer, String, Text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class BoxImage(TimestampMixin, Base):
    """Imagen de la galería de S2 Box (la caja sorpresa mensual)."""

    __tablename__ = "box_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    url: Mapped[str] = mapped_column(Text)
    alt_text: Mapped[str | None] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
