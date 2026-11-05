import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, enum_check
from app.models.enums import MovementKind


class Category(TimestampMixin, Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (CheckConstraint("base_price >= 0", name="base_price_non_negative"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(140), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    # Precio base en pesos colombianos (COP, sin decimales).
    base_price: Mapped[int] = mapped_column(Integer)
    image_url: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    # Eliminación lógica: tiene pedidos, así que se oculta en vez de borrarse.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Marca los datos de demostración para distinguirlos del catálogo real.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    category: Mapped[Category] = relationship()
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product", order_by="ProductVariant.id", cascade="all, delete-orphan"
    )


class ProductVariant(TimestampMixin, Base):
    """Combinación talla/color con su propio SKU y existencias.

    stock_on_hand: unidades físicas. stock_reserved: unidades apartadas por pedidos
    pendientes. Las restricciones CHECK impiden existencias negativas o reservas
    mayores que las existencias, incluso ante un error de programación.
    """

    __tablename__ = "product_variants"
    __table_args__ = (
        UniqueConstraint("product_id", "size", "color", name="uq_product_variants_product_size_color"),
        CheckConstraint("stock_on_hand >= 0", name="stock_on_hand_non_negative"),
        CheckConstraint("stock_reserved >= 0", name="stock_reserved_non_negative"),
        CheckConstraint("stock_reserved <= stock_on_hand", name="stock_reserved_le_on_hand"),
        CheckConstraint("price_override IS NULL OR price_override >= 0", name="price_override_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    sku: Mapped[str] = mapped_column(String(60), unique=True)
    size: Mapped[str] = mapped_column(String(20))
    color: Mapped[str] = mapped_column(String(40))
    price_override: Mapped[int | None] = mapped_column(Integer)
    stock_on_hand: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    stock_reserved: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    product: Mapped[Product] = relationship(back_populates="variants")

    @property
    def unit_price(self) -> int:
        return self.price_override if self.price_override is not None else self.product.base_price

    @property
    def available(self) -> int:
        return self.stock_on_hand - self.stock_reserved

    @property
    def label(self) -> str:
        return f"Talla {self.size} · {self.color}"


class InventoryMovement(Base):
    """Bitácora de cada cambio de existencias (reserva, liberación, venta o ajuste)."""

    __tablename__ = "inventory_movements"
    __table_args__ = (enum_check("kind", MovementKind),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id", ondelete="CASCADE"), index=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    # Positivo suma, negativo resta (sobre la columna afectada según el tipo).
    quantity: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(300))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("profiles.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
