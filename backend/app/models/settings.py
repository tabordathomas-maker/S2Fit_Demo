import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SiteSettings(TimestampMixin, Base):
    """Configuración editable de la tienda. Siempre hay una sola fila (id = 1)."""

    __tablename__ = "site_settings"
    __table_args__ = (CheckConstraint("id = 1", name="single_row"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    # Número comercial de WhatsApp: solo dígitos con indicativo (ej. 573001234567).
    whatsapp_number: Mapped[str | None] = mapped_column(String(20))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("profiles.id", ondelete="SET NULL"))
