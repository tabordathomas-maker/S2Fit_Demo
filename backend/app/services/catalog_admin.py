"""Edición, archivado y eliminación de categorías, productos y variantes desde el panel."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import not_found
from app.models import Category, Product, ProductVariant, Profile
from app.services import archive, audit
from app.services.usage import product_usage, variant_usage


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


def _pending_text(live: dict[str, int]) -> str:
    n = live.get("orders_pending", 0)
    return f"{archive.plural(n, 'pedido', 'pedidos')} esperando pago con unidades reservadas"


def delete_product(db: Session, admin: Profile, product_id: int) -> str:
    product = get_product(db, product_id)
    usage = product_usage(db, [product.id])[product.id]
    # TODO: borrar también la imagen del bucket cuando exista un helper storage.delete (no bloquea el borrado).
    return archive.delete_or_soft_delete(
        db, admin, product, "product", product.id, "product", usage["live"], usage["historical"],
        f"Este producto tiene {_pending_text(usage['live'])}. Puedes archivarlo para ocultarlo de la tienda.",
    )


def delete_variant(db: Session, admin: Profile, variant_id: int) -> str:
    variant = get_variant(db, variant_id)
    usage = variant_usage(db, [variant.id])[variant.id]
    return archive.delete_or_soft_delete(
        db, admin, variant, "product_variant", variant.id, "variant", usage["live"], usage["historical"],
        f"Esta variante tiene {_pending_text(usage['live'])}. Puedes archivarla para ocultarla de la tienda.",
    )


def present_products(db: Session, products: list[Product], include_deleted: bool) -> list[dict]:
    """Productos para el panel con `usage` e `in_use` (consultas agrupadas, sin N+1)."""
    from app.schemas.catalog import AdminProductOut

    p_usage = product_usage(db, [p.id for p in products]) if products else {}
    variant_ids = [v.id for p in products for v in p.variants]
    v_usage = variant_usage(db, variant_ids) if variant_ids else {}
    rows = []
    for product in products:
        data = AdminProductOut.model_validate(product).model_dump()
        data["usage"] = p_usage[product.id]
        data["in_use"] = bool(p_usage[product.id]["live"])
        variants = []
        for variant in data["variants"]:
            if variant["deleted_at"] is not None and not include_deleted:
                continue
            variant["usage"] = v_usage[variant["id"]]
            variant["in_use"] = bool(v_usage[variant["id"]]["live"])
            variants.append(variant)
        data["variants"] = variants
        rows.append(data)
    return rows
