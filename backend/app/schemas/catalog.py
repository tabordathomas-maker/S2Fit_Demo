from datetime import datetime

from pydantic import Field

from app.schemas.common import InputModel, ORMModel

SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


class CategoryOut(ORMModel):
    id: int
    name: str
    slug: str
    description: str | None
    sort_order: int
    is_active: bool


class VariantOut(ORMModel):
    id: int
    sku: str
    size: str
    color: str
    unit_price: int
    available: int
    is_active: bool


class ProductSummary(ORMModel):
    id: int
    name: str
    slug: str
    description: str | None
    base_price: int
    image_url: str | None
    is_demo: bool
    category: CategoryOut
    sizes: list[str]
    colors: list[str]
    in_stock: bool


class ProductDetail(ProductSummary):
    variants: list[VariantOut]


# --- Administración ---


class AdminVariantOut(VariantOut):
    price_override: int | None
    stock_on_hand: int
    stock_reserved: int
    deleted_at: datetime | None = None
    usage: dict | None = None
    in_use: bool = False


class AdminProductOut(ORMModel):
    id: int
    category_id: int
    name: str
    slug: str
    description: str | None
    base_price: int
    image_url: str | None
    is_active: bool
    is_demo: bool
    deleted_at: datetime | None = None
    usage: dict | None = None
    in_use: bool = False
    variants: list[AdminVariantOut]


class CategoryCreate(InputModel):
    name: str = Field(min_length=2, max_length=80)
    slug: str = Field(pattern=SLUG_PATTERN, max_length=80)
    description: str | None = Field(default=None, max_length=1000)
    sort_order: int = 0
    is_active: bool = True


class CategoryUpdate(InputModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=1000)
    sort_order: int | None = None
    is_active: bool | None = None


class ProductCreate(InputModel):
    category_id: int
    name: str = Field(min_length=2, max_length=120)
    slug: str = Field(pattern=SLUG_PATTERN, max_length=140)
    description: str | None = Field(default=None, max_length=4000)
    base_price: int = Field(ge=0, le=50_000_000)
    image_url: str | None = Field(default=None, max_length=500)
    is_active: bool = True


class ProductUpdate(InputModel):
    category_id: int | None = None
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=4000)
    base_price: int | None = Field(default=None, ge=0, le=50_000_000)
    image_url: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class VariantCreate(InputModel):
    sku: str = Field(min_length=2, max_length=60, pattern=r"^[A-Za-z0-9._-]+$")
    size: str = Field(min_length=1, max_length=20)
    color: str = Field(min_length=1, max_length=40)
    price_override: int | None = Field(default=None, ge=0, le=50_000_000)
    initial_stock: int = Field(default=0, ge=0, le=100_000)
    is_active: bool = True


class VariantUpdate(InputModel):
    size: str | None = Field(default=None, min_length=1, max_length=20)
    color: str | None = Field(default=None, min_length=1, max_length=40)
    price_override: int | None = Field(default=None, ge=0, le=50_000_000)
    clear_price_override: bool = False
    is_active: bool | None = None


class StockAdjustment(InputModel):
    # Positivo = entrada de mercancía; negativo = salida (daño, pérdida, conteo).
    delta: int = Field(ge=-100_000, le=100_000)
    note: str = Field(min_length=3, max_length=300)
