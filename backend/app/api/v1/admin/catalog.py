from fastapi import APIRouter, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import AdminUser, DbSession
from app.core.errors import not_found
from app.models import Category, Product, ProductVariant
from app.schemas.catalog import (
    AdminProductOut,
    AdminVariantOut,
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    ProductCreate,
    ProductUpdate,
    StockAdjustment,
    VariantCreate,
    VariantUpdate,
)
from app.services import audit, inventory

router = APIRouter(tags=["admin: catálogo"])


def _product(db: DbSession, product_id: int) -> Product:
    product = db.scalars(
        select(Product).where(Product.id == product_id).options(selectinload(Product.variants))
    ).one_or_none()
    if product is None:
        raise not_found("El producto no existe.")
    return product


def _ensure_category(db: DbSession, category_id: int) -> None:
    if db.get(Category, category_id) is None:
        raise not_found("La categoría no existe.")


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(_: AdminUser, db: DbSession):
    return db.scalars(select(Category).order_by(Category.sort_order, Category.name)).all()


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryCreate, admin: AdminUser, db: DbSession):
    category = Category(**data.model_dump())
    db.add(category)
    db.flush()
    audit.record(db, admin, "category.create", "category", category.id, data.model_dump())
    db.commit()
    return category


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, data: CategoryUpdate, admin: AdminUser, db: DbSession):
    category = db.get(Category, category_id)
    if category is None:
        raise not_found("La categoría no existe.")
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(category, field, value)
    audit.record(db, admin, "category.update", "category", category.id, changes)
    db.commit()
    return category


@router.get("/products", response_model=list[AdminProductOut])
def list_products(_: AdminUser, db: DbSession):
    return db.scalars(select(Product).options(selectinload(Product.variants)).order_by(Product.id)).all()


@router.post("/products", response_model=AdminProductOut, status_code=status.HTTP_201_CREATED)
def create_product(data: ProductCreate, admin: AdminUser, db: DbSession):
    _ensure_category(db, data.category_id)
    product = Product(**data.model_dump())
    db.add(product)
    db.flush()
    audit.record(db, admin, "product.create", "product", product.id, data.model_dump())
    db.commit()
    return _product(db, product.id)


@router.patch("/products/{product_id}", response_model=AdminProductOut)
def update_product(product_id: int, data: ProductUpdate, admin: AdminUser, db: DbSession):
    product = _product(db, product_id)
    changes = data.model_dump(exclude_unset=True)
    if "category_id" in changes:
        _ensure_category(db, changes["category_id"])
    before = {field: getattr(product, field) for field in changes}
    for field, value in changes.items():
        setattr(product, field, value)
    audit.record(db, admin, "product.update", "product", product.id, {"before": before, "after": changes})
    db.commit()
    return _product(db, product.id)


@router.post("/products/{product_id}/variants", response_model=AdminVariantOut, status_code=status.HTTP_201_CREATED)
def create_variant(product_id: int, data: VariantCreate, admin: AdminUser, db: DbSession):
    product = _product(db, product_id)
    values = data.model_dump(exclude={"initial_stock"})
    variant = ProductVariant(product_id=product.id, stock_on_hand=0, **values)
    db.add(variant)
    db.flush()
    if data.initial_stock:
        inventory.adjust_stock(db, variant.id, data.initial_stock, "Existencias iniciales", admin)
    audit.record(db, admin, "variant.create", "product_variant", variant.id, data.model_dump())
    db.commit()
    db.refresh(variant)
    return variant


@router.patch("/variants/{variant_id}", response_model=AdminVariantOut)
def update_variant(variant_id: int, data: VariantUpdate, admin: AdminUser, db: DbSession):
    variant = db.get(ProductVariant, variant_id)
    if variant is None:
        raise not_found("La variante no existe.")
    changes = data.model_dump(exclude_unset=True, exclude={"clear_price_override"})
    if data.clear_price_override:
        changes["price_override"] = None
    for field, value in changes.items():
        setattr(variant, field, value)
    audit.record(db, admin, "variant.update", "product_variant", variant.id, changes)
    db.commit()
    return variant


@router.post("/variants/{variant_id}/stock", response_model=AdminVariantOut)
def adjust_stock(variant_id: int, data: StockAdjustment, admin: AdminUser, db: DbSession):
    variant = inventory.adjust_stock(db, variant_id, data.delta, data.note, admin)
    audit.record(db, admin, "variant.stock_adjust", "product_variant", variant.id,
                 {"delta": data.delta, "note": data.note, "stock_on_hand": variant.stock_on_hand})
    db.commit()
    return variant
