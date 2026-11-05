"""Edición, archivado y eliminación de categorías, productos y variantes desde el panel."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import not_found
from app.models import Category, OrderItem, Product, ProductVariant, Profile
from app.services import archive, audit


def get_category(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise not_found("La categoría no existe.")
    return category


def get_product(db: Session, product_id: int) -> Product:
    product = db.scalars(
        select(Product).where(Product.id == product_id).options(selectinload(Product.variants))
    ).one_or_none()
    if product is None:
        raise not_found("El producto no existe.")
    return product


def get_variant(db: Session, variant_id: int) -> ProductVariant:
    variant = db.get(ProductVariant, variant_id)
    if variant is None:
        raise not_found("La variante no existe.")
    return variant


def _orders_with_product(db: Session, product_id: int) -> int:
    return db.scalar(
        select(func.count(func.distinct(OrderItem.order_id)))
        .join(ProductVariant, ProductVariant.id == OrderItem.variant_id)
        .where(ProductVariant.product_id == product_id)
    ) or 0


def _orders_with_variant(db: Session, variant_id: int) -> int:
    return db.scalar(select(func.count(func.distinct(OrderItem.order_id))).where(OrderItem.variant_id == variant_id)) or 0


def delete_category(db: Session, admin: Profile, category_id: int) -> None:
    category = get_category(db, category_id)
    products = db.scalar(select(func.count(Product.id)).where(Product.category_id == category.id)) or 0
    archive.block_if_referenced(
        f"Esta categoría tiene {archive.plural(products, 'producto', 'productos')}. "
        "Muévelos a otra categoría o archívala para ocultarla de la tienda.",
        {"products": products},
    )
    audit.record(db, admin, "category.delete", "category", category.id, {"name": category.name})
    db.delete(category)


def delete_product(db: Session, admin: Profile, product_id: int) -> None:
    product = get_product(db, product_id)
    orders = _orders_with_product(db, product.id)
    archive.block_if_referenced(
        f"Este producto aparece en {archive.plural(orders, 'pedido', 'pedidos')}. Puedes archivarlo para ocultarlo de la tienda.",
        {"orders": orders},
    )
    # TODO: borrar también la imagen del bucket cuando exista un helper storage.delete (no bloquea el borrado).
    audit.record(db, admin, "product.delete", "product", product.id,
                 {"name": product.name, "variants": len(product.variants)})
    db.delete(product)


def delete_variant(db: Session, admin: Profile, variant_id: int) -> None:
    variant = get_variant(db, variant_id)
    orders = _orders_with_variant(db, variant.id)
    archive.block_if_referenced(
        f"Esta talla aparece en {archive.plural(orders, 'pedido', 'pedidos')}. Puedes archivarla para ocultarla de la tienda.",
        {"orders": orders},
    )
    audit.record(db, admin, "variant.delete", "product_variant", variant.id, {"sku": variant.sku})
    db.delete(variant)
