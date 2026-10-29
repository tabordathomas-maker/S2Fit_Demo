from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import not_found
from app.models import Category, Product, ProductVariant

SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "Única"]


def _size_key(size: str) -> tuple[int, str]:
    return (SIZE_ORDER.index(size), size) if size in SIZE_ORDER else (len(SIZE_ORDER), size)


def _active_variants(product: Product) -> list[ProductVariant]:
    return [v for v in product.variants if v.is_active]


def summarize(product: Product) -> dict:
    variants = _active_variants(product)
    return {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "description": product.description,
        "base_price": product.base_price,
        "image_url": product.image_url,
        "is_demo": product.is_demo,
        "category": product.category,
        "sizes": sorted({v.size for v in variants}, key=_size_key),
        "colors": sorted({v.color for v in variants}),
        "in_stock": any(v.available > 0 for v in variants),
    }


def detail(product: Product) -> dict:
    variants = sorted(_active_variants(product), key=lambda v: (v.color, _size_key(v.size)))
    return {**summarize(product), "variants": variants}


def _public_products():
    return (
        select(Product)
        .join(Product.category)
        .where(Product.is_active.is_(True), Category.is_active.is_(True))
        .options(selectinload(Product.variants), selectinload(Product.category))
    )


def list_categories(db: Session) -> list[Category]:
    return list(db.scalars(select(Category).where(Category.is_active.is_(True)).order_by(Category.sort_order, Category.name)))


def list_products(db: Session, q: str | None, category: str | None, size: str | None, color: str | None) -> list[Product]:
    stmt = _public_products()
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(Product.name.ilike(pattern), Product.description.ilike(pattern)))
    if category:
        stmt = stmt.where(Category.slug == category)
    variant_filters = [ProductVariant.product_id == Product.id, ProductVariant.is_active.is_(True)]
    if size:
        variant_filters.append(ProductVariant.size == size)
    if color:
        variant_filters.append(ProductVariant.color.ilike(color))
    if size or color:
        stmt = stmt.where(exists().where(*variant_filters))
    return list(db.scalars(stmt.order_by(Product.base_price, Product.id)))


def get_product(db: Session, slug: str) -> Product:
    product = db.scalars(_public_products().where(Product.slug == slug)).one_or_none()
    if product is None:
        raise not_found("El producto no existe o no está disponible.")
    return product
