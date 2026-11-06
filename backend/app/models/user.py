import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, enum_check
from app.models.enums import Role


class Profile(TimestampMixin, Base):
    """Datos de la persona. El id coincide con auth.users.id de Supabase."""

    __tablename__ = "profiles"
    __table_args__ = (
        enum_check("role", Role),
        CheckConstraint(
            "mi_ruta_unlock_source IS NULL OR mi_ruta_unlock_source IN ('order', 'code', 'admin')",
            name="mi_ruta_unlock_source_valid",
        ),
        # Un código de acceso se liga a una sola cuenta.
        Index("uq_profiles_mi_ruta_code_id", "mi_ruta_code_id", unique=True, postgresql_where=text("mi_ruta_code_id IS NOT NULL")),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    email: Mapped[str | None] = mapped_column(String(320), index=True)
    full_name: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(20))
    role: Mapped[str] = mapped_column(String(20), default=Role.customer, server_default=Role.customer.value)

    # Última vez que la persona abrió la campanita; las notificaciones se derivan de los datos existentes.
    notifications_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Mi Ruta: cuándo se habilitó la cuenta y por qué (order | code | admin). Null = sin acceso por cuenta.
    mi_ruta_unlocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    mi_ruta_unlock_source: Mapped[str | None] = mapped_column(String(20))
    mi_ruta_code_id: Mapped[int | None] = mapped_column(
        ForeignKey("access_codes.id", ondelete="SET NULL", use_alter=True, name="fk_profiles_mi_ruta_code_id_access_codes")
    )

    @property
    def is_admin(self) -> bool:
        return self.role == Role.admin
