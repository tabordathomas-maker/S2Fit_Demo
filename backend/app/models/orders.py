import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, enum_check
from app.models.catalog import ProductVariant
from app.models.enums import OrderStatus, ReservationStatus
from app.models.user import Profile


class Order(TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (
        enum_check("status", OrderStatus),
        enum_check("reservation_status", ReservationStatus),
        CheckConstraint("total >= 0 AND subtotal >= 0", name="amounts_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    reference: Mapped[str] = mapped_column(String(24), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"), index=True)
    status: Mapped[str] = mapped_column(String(20), default=OrderStatus.pending_payment, index=True)
    subtotal: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    reservation_status: Mapped[str] = mapped_column(String(20), default=ReservationStatus.active)
    reservation_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    customer_note: Mapped[str | None] = mapped_column(String(500))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", order_by="OrderItem.id", cascade="all, delete-orphan"
    )
    user: Mapped[Profile] = relationship()
    payment: Mapped["Payment | None"] = relationship(back_populates="order", uselist=False)  # noqa: F821


class OrderItem(Base):
    """Línea de pedido. Guarda una copia del nombre y del precio unitario del momento
    de la compra, para que los cambios posteriores del catálogo no alteren el pedido."""

    __tablename__ = "order_items"
    __table_args__ = (
        UniqueConstraint("order_id", "variant_id", name="uq_order_items_order_variant"),
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id", ondelete="RESTRICT"), index=True)
    product_name: Mapped[str] = mapped_column(String(120))
    variant_label: Mapped[str] = mapped_column(String(80))
    sku: Mapped[str] = mapped_column(String(60))
    unit_price: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)
    line_total: Mapped[int] = mapped_column(Integer)

    order: Mapped[Order] = relationship(back_populates="items")
    variant: Mapped[ProductVariant] = relationship()
