import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
    false,
    true,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, TimestampMixin, enum_check
from app.models.enums import SubscriptionRequestKind, SubscriptionRequestStatus, SubscriptionStatus
from app.models.payments import Payment
from app.models.user import Profile


class Plan(TimestampMixin, Base):
    __tablename__ = "plans"
    __table_args__ = (
        CheckConstraint("price IS NULL OR price > 0", name="price_positive"),
        CheckConstraint("duration_days > 0", name="duration_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(Text)
    # Nulo = precio por definir: se muestra "Consulta el precio por WhatsApp".
    price: Mapped[int | None] = mapped_column(Integer)
    duration_days: Mapped[int] = mapped_column(Integer, default=30)
    period_label: Mapped[str] = mapped_column(String(40), default="mensual")
    benefits: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    # Con true, la API pública devuelve price = null (precio por confirmar); el panel sí lo ve.
    hide_price: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # Eliminación lógica: tiene historial, así que se oculta en vez de borrarse.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class SubscriptionRequest(TimestampMixin, Base):
    """Intención de suscribirse o renovar, creada desde el botón de la web antes de abrir WhatsApp."""

    __tablename__ = "subscription_requests"
    __table_args__ = (
        enum_check("kind", SubscriptionRequestKind),
        enum_check("status", SubscriptionRequestStatus),
        CheckConstraint("agreed_price IS NULL OR agreed_price > 0", name="agreed_price_positive"),
        CheckConstraint(
            "agreed_duration_days IS NULL OR agreed_duration_days > 0", name="agreed_duration_positive"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    reference: Mapped[str] = mapped_column(String(24), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"), index=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id", ondelete="RESTRICT"))
    kind: Mapped[str] = mapped_column(String(20), default=SubscriptionRequestKind.new)
    status: Mapped[str] = mapped_column(String(20), default=SubscriptionRequestStatus.pending_payment, index=True)
    # Condiciones acordadas por WhatsApp; las registra un administrador.
    agreed_price: Mapped[int | None] = mapped_column(Integer)
    agreed_duration_days: Mapped[int | None] = mapped_column(Integer)

    plan: Mapped[Plan] = relationship()
    user: Mapped[Profile] = relationship()
    payment: Mapped[Payment | None] = relationship(back_populates="subscription_request", uselist=False)


class Subscription(TimestampMixin, Base):
    """Membresía S2 Box de una persona (una fila por usuario; las renovaciones la extienden)."""

    __tablename__ = "subscriptions"
    __table_args__ = (
        enum_check("status", SubscriptionStatus),
        CheckConstraint(
            "status <> 'active' OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at)",
            name="active_has_dates",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"), unique=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(20), default=SubscriptionStatus.pending_payment, index=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    origin_request_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subscription_requests.id", ondelete="SET NULL")
    )
    amount_paid: Mapped[int | None] = mapped_column(Integer)
    last_payment_reference: Mapped[str | None] = mapped_column(String(100))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    plan: Mapped[Plan] = relationship()
    user: Mapped[Profile] = relationship()
    renewals: Mapped[list["SubscriptionRenewal"]] = relationship(
        back_populates="subscription", order_by="SubscriptionRenewal.created_at"
    )


class SubscriptionRenewal(CreatedAtMixin, Base):
    """Historial: cada pago confirmado que activa o extiende la membresía."""

    __tablename__ = "subscription_renewals"
    __table_args__ = (CheckConstraint("period_end > period_start", name="period_valid"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="CASCADE"), index=True
    )
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("subscription_requests.id", ondelete="RESTRICT"))
    payment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("payments.id", ondelete="RESTRICT"), unique=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id", ondelete="RESTRICT"))
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duration_days: Mapped[int] = mapped_column(Integer)
    amount: Mapped[int] = mapped_column(Integer)
    confirmed_by: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("profiles.id", ondelete="RESTRICT"))

    subscription: Mapped[Subscription] = relationship(back_populates="renewals")
    plan: Mapped[Plan] = relationship()

