from tests.factories import create_admin, create_variant


def test_catalog_lists_active_products_with_variants(client, db):
    # Arrange
    variant = create_variant(db, stock=3, price=145_000, name="Set lila")
    create_variant(db, active=False, name="Producto oculto")

    # Act
    response = client.get("/api/v1/catalog/products")

    # Assert
    assert response.status_code == 200
    products = response.json()
    assert [p["name"] for p in products] == ["Set lila"]
    assert products[0]["base_price"] == 145_000
    assert products[0]["sizes"] == ["M"] and products[0]["colors"] == ["Lila"]
    assert products[0]["in_stock"] is True
    assert products[0]["slug"] == variant.product.slug


def test_catalog_search_and_filters(client, db):
    # Arrange
    create_variant(db, name="Set aqua")
    create_variant(db, name="Mono negro")

    # Act
    by_text = client.get("/api/v1/catalog/products", params={"q": "mono"}).json()
    by_size = client.get("/api/v1/catalog/products", params={"size": "XL"}).json()

    # Assert
    assert [p["name"] for p in by_text] == ["Mono negro"]
    assert by_size == []


def test_product_detail_shows_available_units(client, db):
    # Arrange
    variant = create_variant(db, stock=4)

    # Act
    response = client.get(f"/api/v1/catalog/products/{variant.product.slug}")

    # Assert
    assert response.status_code == 200
    assert response.json()["variants"][0]["available"] == 4


def test_unknown_product_returns_404(client):
    assert client.get("/api/v1/catalog/products/no-existe").status_code == 404


def test_admin_creates_and_deactivates_product(client, db):
    # Arrange
    admin = create_admin(db)
    category = client.post("/api/v1/admin/categories", json={"name": "Tops", "slug": "tops"}, headers=admin.headers).json()

    # Act
    product = client.post(
        "/api/v1/admin/products",
        json={"category_id": category["id"], "name": "Top nuevo", "slug": "top-nuevo", "base_price": 80_000},
        headers=admin.headers,
    ).json()
    variant = client.post(
        f"/api/v1/admin/products/{product['id']}/variants",
        json={"sku": "TOP-NUEVO-M", "size": "M", "color": "Negro", "initial_stock": 7},
        headers=admin.headers,
    )
    visible = client.get("/api/v1/catalog/products").json()
    client.patch(f"/api/v1/admin/products/{product['id']}", json={"is_active": False}, headers=admin.headers)
    hidden = client.get("/api/v1/catalog/products").json()

    # Assert
    assert variant.status_code == 201 and variant.json()["stock_on_hand"] == 7
    assert [p["name"] for p in visible] == ["Top nuevo"]
    assert hidden == []


def test_duplicate_sku_is_rejected(client, db):
    # Arrange
    admin = create_admin(db)
    variant = create_variant(db)

    # Act
    response = client.post(
        f"/api/v1/admin/products/{variant.product_id}/variants",
        json={"sku": variant.sku, "size": "L", "color": "Lila"},
        headers=admin.headers,
    )

    # Assert
    assert response.status_code == 409


def test_stock_cannot_drop_below_reserved_units(client, db):
    # Arrange
    admin = create_admin(db)
    variant = create_variant(db, stock=2)
    from tests.factories import new_user, place_order

    place_order(client, new_user(), variant.id, quantity=2)

    # Act
    response = client.post(f"/api/v1/admin/variants/{variant.id}/stock", json={"delta": -1, "note": "Conteo"},
                           headers=admin.headers)

    # Assert
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "stock_below_reserved"
