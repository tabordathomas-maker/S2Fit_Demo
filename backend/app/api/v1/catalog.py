from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession
from app.schemas.catalog import CategoryOut, ProductDetail, ProductSummary
from app.services import catalog

router = APIRouter(prefix="/catalog", tags=["catálogo"])


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: DbSession):
    return catalog.list_categories(db)


@router.get("/products", response_model=list[ProductSummary])
def list_products(
    db: DbSession,
    q: Annotated[str | None, Query(max_length=80)] = None,
    category: Annotated[str | None, Query(max_length=80)] = None,
    size: Annotated[str | None, Query(max_length=20)] = None,
    color: Annotated[str | None, Query(max_length=40)] = None,
):
    return [catalog.summarize(p) for p in catalog.list_products(db, q, category, size, color)]


@router.get("/products/{slug}", response_model=ProductDetail)
def get_product(slug: str, db: DbSession):
    return catalog.detail(catalog.get_product(db, slug))
