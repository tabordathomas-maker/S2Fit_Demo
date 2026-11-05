"""CRUD de catálogo desde el panel: editar, archivar, restaurar y eliminar."""

from app.models import AdminAuditLog, Category, InventoryMovement, Product, ProductVariant
from tests.factories import create_admin, create_variant, new_user, place_order

BASE = "/api/v1/admin"


def _names(response):
    return [p["name"] for p in response.json()]


def test_patch_product_updates_only_sent_fields_and_audits_changes(client, db):
    # Arrange
    admin = create_admin(db)
    variant = create_variant(db, name="Set lila", price=100_000)
    product = variant.product

    # Act
    response = client.patch(f"{BASE}/products/{product.id}", json={"base_price": 120_000, "image_url": None}, headers=admin.headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["base_price"] == 120_000 and body["name"] == "Set lila" and body["image_url"] is None
    log = db.query(AdminAuditLog).filter_by(action="product.update").one()
    assert log.entity_id == str(product.id)
    assert log.details["changed_fields"] == ["base_price"] and log.details["after"] == {"base_price": 120_000}


def test_patch_product_rejects_extra_and_invalid_fields(client, db):
    # Arrange
    admin = create_admin(db)
    product = create_variant(db).product
    url = f"{BASE}/products/{product.id}"

    # Act / Assert
    assert client.patch(url, json={"slug": "otro"}, headers=admin.headers).status_code == 422
    assert client.patch(url, json={"base_price": -1}, headers=admin.headers).status_code == 422
    assert client.patch(url, json={"name": "x"}, headers=admin.headers).status_code == 422


def test_delete_product_without_orders_removes_variants_too(client, db):
    # Arrange
    admin = create_admin(db)
    variant = create_variant(db, stock=4)
    product_id, variant_id = variant.product.id, variant.id

    # Act
    response = client.delete(f"{BASE}/products/{product_id}", headers=admin.headers)

    # Assert
    assert response.status_code == 204
    db.expire_all()
    assert db.get(Product, product_id) is None and db.get(ProductVariant, variant_id) is None
    assert db.query(InventoryMovement).filter_by(variant_id=variant_id).count() == 0
    assert db.query(AdminAuditLog).filter_by(action="product.delete", entity_id=str(product_id)).count() == 1
    assert client.get(f"{BASE}/products/{product_id}", headers=admin.headers).status_code == 404


def test_delete_product_in_orders_returns_resource_in_use_with_counts(client, db):
    # Arrange
    admin = create_admin(db)
    variant = create_variant(db, stock=9)
    for _ in range(3):
        assert place_order(client, new_user(), variant.id).status_code == 201

    # Act
    response = client.delete(f"{BASE}/products/{variant.product.id}", headers=admin.headers)

    # Assert
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "RESOURCE_IN_USE"
    assert error["message"] == "Este producto aparece en 3 pedidos. Puedes archivarlo para ocultarlo de la tienda."
    assert error["details"] == {"orders": 3}
    assert db.get(Product, variant.product.id) is not None


def test_archive_hides_product_from_public_and_restore_shows_it_again(client, db):
    # Arrange
    admin = create_admin(db)
    product = create_variant(db, name="Set lila").product
    public = "/api/v1/catalog/products"

    # Act
    archived = client.post(f"{BASE}/products/{product.id}/archive", headers=admin.headers)
    hidden = client.get(public)
    default_list = client.get(f"{BASE}/products", headers=admin.headers)
    with_archived = client.get(f"{BASE}/products", params={"include_archived": "true"}, headers=admin.headers)
    restored = client.post(f"{BASE}/products/{product.id}/restore", headers=admin.headers)
    shown = client.get(public)

    # Assert
    assert archived.status_code == 200 and archived.json()["is_active"] is False
    assert _names(hidden) == [] and _names(default_list) == []
    assert _names(with_archived) == ["Set lila"]
    assert restored.json()["is_active"] is True and _names(shown) == ["Set lila"]
    actions = {log.action for log in db.query(AdminAuditLog).all()}
    assert {"product.archive", "product.restore"} <= actions


def test_category_delete_blocked_when_it_has_products_and_allowed_when_empty(client, db):
    # Arrange
    admin = create_admin(db)
    category = create_variant(db).product.category
    empty = client.post(f"{BASE}/categories", json={"name": "Vacía", "slug": "vacia"}, headers=admin.headers).json()

    # Act
    blocked = client.delete(f"{BASE}/categories/{category.id}", headers=admin.headers)
    allowed = client.delete(f"{BASE}/categories/{empty['id']}", headers=admin.headers)

    # Assert
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "RESOURCE_IN_USE" and blocked.json()["error"]["details"] == {"products": 1}
    assert allowed.status_code == 204
    db.expire_all()
    assert db.get(Category, empty["id"]) is None


def test_category_patch_archive_and_hidden_from_public(client, db):
    # Arrange
    admin = create_admin(db)
    variant = create_variant(db, name="Set lila")
    category = variant.product.category

    # Act
    patched = client.patch(f"{BASE}/categories/{category.id}", json={"name": "Conjuntos"}, headers=admin.headers)
    extra = client.patch(f"{BASE}/categories/{category.id}", json={"slug": "x"}, headers=admin.headers)
    client.post(f"{BASE}/categories/{category.id}/archive", headers=admin.headers)
    public_categories = client.get("/api/v1/catalog/categories")
    admin_default = client.get(f"{BASE}/categories", headers=admin.headers)
    admin_all = client.get(f"{BASE}/categories", params={"include_archived": "true"}, headers=admin.headers)
    client.post(f"{BASE}/categories/{category.id}/restore", headers=admin.headers)

    # Assert
    assert patched.json()["name"] == "Conjuntos" and extra.status_code == 422
    assert public_categories.json() == [] and admin_default.json() == []
    assert [c["id"] for c in admin_all.json()] == [category.id]
    assert [c["id"] for c in client.get("/api/v1/catalog/categories").json()] == [category.id]


def test_variant_delete_archive_and_stock_floor(client, db):
    # Arrange
    admin = create_admin(db)
    used = create_variant(db, stock=5)
    place_order(client, new_user(), used.id, quantity=3)
    free = create_variant(db, stock=2)

    # Act
    in_use = client.delete(f"{BASE}/variants/{used.id}", headers=admin.headers)
    below = client.post(f"{BASE}/variants/{used.id}/stock", json={"delta": -4, "note": "Conteo físico"}, headers=admin.headers)
    archived = client.post(f"{BASE}/variants/{used.id}/archive", headers=admin.headers)
    removed = client.delete(f"{BASE}/variants/{free.id}", headers=admin.headers)

    # Assert
    assert in_use.status_code == 409 and in_use.json()["error"]["code"] == "RESOURCE_IN_USE"
    assert in_use.json()["error"]["details"] == {"orders": 1}
    assert below.status_code == 409 and "3 unidades" in below.json()["error"]["message"]
    assert archived.json()["is_active"] is False
    assert removed.status_code == 204


def test_admin_catalog_routes_404_401_403(client, db):
    # Arrange
    admin, customer = create_admin(db), new_user()

    # Act / Assert
    for method, path in [("delete", "/products/999"), ("post", "/products/999/archive"), ("post", "/products/999/restore"),
                         ("delete", "/categories/999"), ("post", "/categories/999/archive"), ("delete", "/variants/999"),
                         ("post", "/variants/999/restore")]:
        call = getattr(client, method)
        assert call(f"{BASE}{path}", headers=admin.headers).status_code == 404, path
        assert call(f"{BASE}{path}").status_code == 401, path
        assert call(f"{BASE}{path}", headers=customer.headers).status_code == 403, path
    assert client.patch(f"{BASE}/products/999", json={"name": "Nuevo"}, headers=admin.headers).status_code == 404
