import uuid

from sqlalchemy import String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, enum_check
from app.models.enums import Role


class Profile(TimestampMixin, Base):
    """Datos de la persona. El id coincide con auth.users.id de Supabase."""

    __tablename__ = "profiles"
    __table_args__ = (enum_check("role", Role),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    email: Mapped[str | None] = mapped_column(String(320), index=True)
    full_name: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(20))
    role: Mapped[str] = mapped_column(String(20), default=Role.customer, server_default=Role.customer.value)

    @property
    def is_admin(self) -> bool:
        return self.role == Role.admin
