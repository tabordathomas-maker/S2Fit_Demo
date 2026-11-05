from typing import Annotated

from fastapi import APIRouter, Query, Response, status
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
from app.services import archive, audit, catalog_admin, inventory

router = APIRouter(tags=["admin: catálogo"])


IncludeArchived = Annotated[bool, Query(description="Incluye lo archivado (por defecto solo lo activo).")]
IncludeDeleted = Annotated[bool, Query(description="Incluye lo eliminado (eliminación lógica).")]


def _product(db: DbSession, product_id: int) -> Product:
    return catalog_admin.get_product(db, product_id)


def _ensure_category(db: DbSession, category_id: int) -> None:
    if db.get(Category, category_id) is None:
        raise not_found("La categoría no existe.")


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(_: AdminUser, db: DbSession, include_archived: IncludeArchived = False):
    stmt = select(Category).order_by(Category.sort_order, Category.name)
    if not include_archived:
        stmt = stmt.where(Category.is_active.is_(True))
    return db.scalars(stmt).all()


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
    category = catalog_admin.get_category(db, category_id)
    archive.apply_update(db, admin, category, "category", category.id, data.model_dump(exclude_unset=True))
    db.commit()
    return category


@router.post("/categories/{category_id}/archive", response_model=CategoryOut)
def archive_category(category_id: int, admin: AdminUser, db: DbSession):
    category = catalog_admin.get_category(db, category_id)
    archive.set_archived(db, admin, category, "category", category.id, True)
    db.commit()
    return category


@router.post("/categories/{category_id}/restore", response_model=CategoryOut)
def restore_category(category_id: int, admin: AdminUser, db: DbSession):
    category = catalog_admin.get_category(db, category_id)
    archive.set_archived(db, admin, category, "category", category.id, False)
    db.commit()
    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, admin: AdminUser, db: DbSession):
    catalog_admin.delete_category(db, admin, category_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/products", response_model=list[AdminProductOut])
def list_products(_: AdminUser, db: DbSession, include_archived: IncludeArchived = False, include_deleted: IncludeDeleted = False):
    stmt = select(Product).options(selectinload(Product.variants)).order_by(Product.id)
    if not include_deleted:
        stmt = stmt.where(Product.deleted_at.is_(None))
        if not include_archived:
            stmt = stmt.where(Product.is_active.is_(True))
    return catalog_admin.present_products(db, list(db.scalars(stmt).all()), include_deleted)


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
    archive.apply_update(db, admin, product, "product", product.id, changes)
    db.commit()
    return _product(db, product.id)


@router.post("/products/{product_id}/archive", response_model=AdminProductOut)
def archive_product(product_id: int, admin: AdminUser, db: DbSession):
    product = _product(db, product_id)
    archive.set_archived(db, admin, product, "product", product.id, True)
    db.commit()
    return _product(db, product.id)


@router.post("/products/{product_id}/restore", response_model=AdminProductOut)
def restore_product(product_id: int, admin: AdminUser, db: DbSession):
    product = _product(db, product_id)
    archive.set_archived(db, admin, product, "product", product.id, False)
    db.commit()
    return _product(db, product.id)


@router.get("/products/{product_id}", response_model=AdminProductOut)
def get_product(product_id: int, _: AdminUser, db: DbSession):
    return _product(db, product_id)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, admin: AdminUser, db: DbSession):
    catalog_admin.delete_product(db, admin, product_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    variant = catalog_admin.get_variant(db, variant_id)
    changes = data.model_dump(exclude_unset=True, exclude={"clear_price_override"})
    if data.clear_price_override:
        changes["price_override"] = None
    archive.apply_update(db, admin, variant, "product_variant", variant.id, changes)
    db.commit()
    return variant


@router.post("/variants/{variant_id}/archive", response_model=AdminVariantOut)
def archive_variant(variant_id: int, admin: AdminUser, db: DbSession):
    variant = catalog_admin.get_variant(db, variant_id)
    archive.set_archived(db, admin, variant, "product_variant", variant.id, True)
    db.commit()
    return variant


@router.post("/variants/{variant_id}/restore", response_model=AdminVariantOut)
def restore_variant(variant_id: int, admin: AdminUser, db: DbSession):
    variant = catalog_admin.get_variant(db, variant_id)
    archive.set_archived(db, admin, variant, "product_variant", variant.id, False)
    db.commit()
    return variant


@router.delete("/variants/{variant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_variant(variant_id: int, admin: AdminUser, db: DbSession):
    catalog_admin.delete_variant(db, admin, variant_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/variants/{variant_id}/stock", response_model=AdminVariantOut)
def adjust_stock(variant_id: int, data: StockAdjustment, admin: AdminUser, db: DbSession):
    variant = inventory.adjust_stock(db, variant_id, data.delta, data.note, admin)
    audit.record(db, admin, "variant.stock_adjust", "product_variant", variant.id,
                 {"delta": data.delta, "note": data.note, "stock_on_hand": variant.stock_on_hand})
    db.commit()
    return variant
