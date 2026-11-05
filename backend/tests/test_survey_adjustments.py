"""Ajustes para la encuesta: precio de plan oculto y filtro de talla sin mayúsculas ni tildes."""

import os

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.core.database import engine
from app.models import Category, Product, ProductVariant
from tests.conftest import BACKEND_DIR, TEST_DATABASE_URL
from tests.factories import create_admin, create_plan, new_user

ADMIN = "/api/v1/admin"


def test_hidden_price_is_null_for_public_but_visible_for_admin(client, db):
    # Arrange
    admin = create_admin(db)
    plan = create_plan(db, price=60_000)

    # Act
    patched = client.patch(f"{ADMIN}/plans/{plan.id}", json={"hide_price": True}, headers=admin.headers)
    public = client.get("/api/v1/plans").json()
    admin_view = client.get(f"{ADMIN}/plans", headers=admin.headers).json()

    # Assert
    assert patched.status_code == 200 and patched.json()["hide_price"] is True and patched.json()["price"] == 60_000
    assert public[0]["price"] is None and public[0]["hide_price"] is True
    assert admin_view[0]["price"] == 60_000


def test_visible_price_is_returned_by_default(client, db):
    # Arrange
    create_plan(db, price=60_000)

    # Act
    public = client.get("/api/v1/plans").json()

    # Assert
    assert public[0]["price"] == 60_000 and public[0]["hide_price"] is False


def test_patch_hide_price_rejects_extra_fields_and_invalid_values(client, db):
    # Arrange
    admin = create_admin(db)
    plan = create_plan(db)
    url = f"{ADMIN}/plans/{plan.id}"

    # Act / Assert
    assert client.patch(url, json={"hide_prices": True}, headers=admin.headers).status_code == 422
    assert client.patch(url, json={"hide_price": "quizás"}, headers=admin.headers).status_code == 422
    assert client.patch(url, json={"hide_price": True}, headers=new_user().headers).status_code == 403


def test_size_filter_ignores_case_and_accents(client, db):
    # Arrange
    category = Category(name="Sets", slug="sets")
    product = Product(name="Set Soul", slug="set-soul", base_price=100_000, category=category)
    db.add_all([category, product, ProductVariant(product=product, sku="SOUL-U", size="Unica", color="Negro", stock_on_hand=2)])
    db.commit()

    # Act
    results = {s: client.get("/api/v1/catalog/products", params={"size": s}).json() for s in ["Única", "UNICA", "unica", "Unica"]}
    other = client.get("/api/v1/catalog/products", params={"size": "XL"}).json()

    # Assert
    assert all([p["name"] for p in found] == ["Set Soul"] for found in results.values())
    assert other == []


def test_migration_0006_adds_and_drops_hide_price():
    # Arrange
    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    cfg.attributes["database_url"] = TEST_DATABASE_URL
    engine.dispose()

    # Act / Assert
    try:
        command.downgrade(cfg, "0005")
        assert "hide_price" not in {c["name"] for c in inspect(engine).get_columns("plans")}
    finally:
        engine.dispose()
        command.upgrade(cfg, "head")
    engine.dispose()
    assert "hide_price" in {c["name"] for c in inspect(engine).get_columns("plans")}
