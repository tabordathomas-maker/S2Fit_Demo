import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, enum_check
from app.models.enums import PaymentKind, PaymentMethod, PaymentStatus
from app.models.orders import Order
from app.models.user import Profile


class Payment(TimestampMixin, Base):
    """Pago manual asociado a un pedido o a una solicitud de suscripción.

    Se crea en estado "pending" junto con la operación. Solo un administrador puede
    confirmarlo, después de contrastar el ingreso con el convenio de pago.
    """

    __tablename__ = "payments"
    __table_args__ = (
        enum_check("kind", PaymentKind),
        enum_check("status", PaymentStatus),
        enum_check("method", PaymentMethod, nullable=True),
        CheckConstraint(
            "(kind = 'order' AND order_id IS NOT NULL AND subscription_request_id IS NULL) OR "
            "(kind = 'subscription' AND subscription_request_id IS NOT NULL AND order_id IS NULL)",
            name="single_target",
        ),
        CheckConstraint("amount IS NULL OR amount > 0", name="amount_positive"),
        CheckConstraint(
            "status NOT IN ('confirmed', 'refunded') OR (amount IS NOT NULL AND decided_by IS NOT NULL)",
            name="confirmed_has_amount_and_admin",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(20))
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), unique=True)
    subscription_request_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subscription_requests.id", ondelete="RESTRICT"), unique=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"), index=True)
    # Importe acordado en COP. En suscripciones lo registra el administrador.
    amount: Mapped[int | None] = mapped_column(Integer)
    method: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default=PaymentStatus.pending, index=True)
    # Referencia de la transacción en el convenio (banco, corresponsal...). Única: un
    # mismo ingreso no puede confirmar dos operaciones.
    external_reference: Mapped[str | None] = mapped_column(String(100), unique=True)
    admin_notes: Mapped[str | None] = mapped_column(Text)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("profiles.id", ondelete="RESTRICT"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped[Order | None] = relationship(back_populates="payment")
    subscription_request: Mapped["SubscriptionRequest | None"] = relationship(back_populates="payment")  # noqa: F821
    user: Mapped[Profile] = relationship(foreign_keys=[user_id])
    decided_by_profile: Mapped[Profile | None] = relationship(foreign_keys=[decided_by])

    @property
    def operation_reference(self) -> str:
        if self.order is not None:
            return self.order.reference
        return self.subscription_request.reference if self.subscription_request else ""
