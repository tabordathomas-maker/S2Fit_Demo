"""Pedidos, reservas de inventario y concurrencia."""

import threading

from app.core import clock
from app.core.database import SessionLocal
from app.core.errors import AppError
from app.models import InventoryMovement, Order, Payment, ProductVariant, Profile
from app.schemas.orders import OrderCreate
from app.services import orders as order_service
from tests.factories import create_admin, create_variant, new_user, payment_for, place_order


def test_create_order_calculates_price_and_reserves_stock(client, db):
    # Arrange
    user = new_user()
    variant = create_variant(db, stock=5, price=125_000, name="Set azul rey")

    # Act
    response = place_order(client, user, variant.id, quantity=2)

    # Assert
    assert response.status_code == 201
    order = response.json()
    assert order["reference"].startswith("S2-ORD-")
    assert order["status"] == "pending_payment"
    assert order["total"] == 250_000
    assert order["items"][0]["unit_price"] == 125_000
    assert order["payment"]["status"] == "pending"
    assert order["reference"] in order["whatsapp_message"]
    assert "Set azul rey" in order["whatsapp_message"]
    db.refresh(variant)
    assert (variant.stock_on_hand, variant.stock_reserved) == (5, 2)


def test_browser_supplied_price_is_rejected(client, db):
    # Arrange
    variant = create_variant(db)

    # Act
    response = client.post(
        "/api/v1/orders",
        json={"items": [{"variant_id": variant.id, "quantity": 1, "unit_price": 1}], "total": 1},
        headers=new_user().headers,
    )

    # Assert
    assert response.status_code == 422


def test_order_requires_authentication(client, db):
    variant = create_variant(db)
    response = client.post("/api/v1/orders", json={"items": [{"variant_id": variant.id, "quantity": 1}]})
    assert response.status_code == 401


def test_nonexistent_variant_is_rejected(client):
    # Act
    response = place_order(client, new_user(), variant_id=999_999)

    # Assert
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "variant_not_found"


def test_inactive_product_cannot_be_ordered(client, db):
    variant = create_variant(db, active=False)
    response = place_order(client, new_user(), variant.id)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "variant_unavailable"


def test_insufficient_stock_is_rejected_without_side_effects(client, db):
    # Arrange
    variant = create_variant(db, stock=1)

    # Act
    response = place_order(client, new_user(), variant.id, quantity=2)

    # Assert
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "insufficient_stock"
    db.refresh(variant)
    assert variant.stock_reserved == 0
    assert db.query(Order).count() == 0


def test_users_only_see_their_own_orders(client, db):
    # Arrange
    alice, bob = new_user(), new_user()
    variant = create_variant(db)
    reference = place_order(client, alice, variant.id).json()["reference"]

    # Act
    bob_list = client.get("/api/v1/orders", headers=bob.headers).json()
    bob_detail = client.get(f"/api/v1/orders/{reference}", headers=bob.headers)
    bob_cancel = client.post(f"/api/v1/orders/{reference}/cancel", headers=bob.headers)
    alice_list = client.get("/api/v1/orders", headers=alice.headers).json()

    # Assert
    assert bob_list == []
    assert bob_detail.status_code == 404
    assert bob_cancel.status_code == 404
    assert [o["reference"] for o in alice_list] == [reference]


def test_cancel_releases_reservation_only_once(client, db):
    # Arrange
    user = new_user()
    variant = create_variant(db, stock=3)
    reference = place_order(client, user, variant.id, quantity=2).json()["reference"]

    # Act
    first = client.post(f"/api/v1/orders/{reference}/cancel", headers=user.headers)
    second = client.post(f"/api/v1/orders/{reference}/cancel", headers=user.headers)

    # Assert
    assert first.status_code == 200 and first.json()["status"] == "cancelled"
    assert first.json()["payment"]["status"] == "cancelled"
    assert second.status_code == 409
    db.refresh(variant)
    assert (variant.stock_on_hand, variant.stock_reserved) == (3, 0)
    releases = db.query(InventoryMovement).filter_by(variant_id=variant.id, kind="release").count()
    assert releases == 1


def test_order_items_keep_historical_price(client, db):
    # Arrange
    admin, user = create_admin(db), new_user()
    variant = create_variant(db, price=100_000)
    reference = place_order(client, user, variant.id).json()["reference"]

    # Act
    client.patch(f"/api/v1/admin/products/{variant.product_id}", json={"base_price": 180_000}, headers=admin.headers)
    order = client.get(f"/api/v1/orders/{reference}", headers=user.headers).json()

    # Assert
    assert order["items"][0]["unit_price"] == 100_000
    assert order["total"] == 100_000


def test_expired_reservation_blocks_confirmation_until_renewed(client, db, frozen_clock):
    # Arrange
    admin, user = create_admin(db), new_user()
    variant = create_variant(db, stock=1)
    order = place_order(client, user, variant.id).json()
    payment = payment_for(client, admin, order["reference"])
    confirm_body = {"operation_reference": order["reference"], "amount": order["total"], "method": "transfer",
                    "external_reference": "BANCO-001"}
    frozen_clock.advance(minutes=61)

    # Act
    blocked = client.post(f"/api/v1/admin/payments/{payment['id']}/confirm", json=confirm_body, headers=admin.headers)
    swept = client.post("/api/v1/admin/orders/expire-reservations", headers=admin.headers).json()
    db.refresh(variant)
    reserved_after_sweep = variant.stock_reserved
    renewed = client.post(f"/api/v1/admin/orders/{order['id']}/renew-reservation", headers=admin.headers)
    confirmed = client.post(f"/api/v1/admin/payments/{payment['id']}/confirm", json=confirm_body, headers=admin.headers)

    # Assert
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "reservation_expired"
    assert swept == {"expired_orders": 1}
    assert reserved_after_sweep == 0
    assert renewed.status_code == 200 and renewed.json()["status"] == "pending_payment"
    assert confirmed.status_code == 200
    db.refresh(variant)
    assert (variant.stock_on_hand, variant.stock_reserved) == (0, 0)


def test_renewal_fails_if_stock_was_sold_meanwhile(client, db, frozen_clock):
    # Arrange
    admin, first_buyer, second_buyer = create_admin(db), new_user(), new_user()
    variant = create_variant(db, stock=1)
    first = place_order(client, first_buyer, variant.id).json()
    frozen_clock.advance(minutes=61)
    # La segunda compra libera la reserva vencida y se queda con la última unidad.
    assert place_order(client, second_buyer, variant.id).status_code == 201

    # Act
    response = client.post(f"/api/v1/admin/orders/{first['id']}/renew-reservation", headers=admin.headers)

    # Assert
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "insufficient_stock"


def test_concurrent_orders_never_oversell(client, db):
    # Arrange: dos personas compran la última unidad al mismo tiempo.
    variant = create_variant(db, stock=1)
    buyers = []
    for _ in range(2):
        user = new_user()
        db.add(Profile(id=user.id, email=user.email))
        buyers.append(user.id)
    db.commit()
    barrier = threading.Barrier(2)
    results: list[str] = []

    def buy(user_id):
        with SessionLocal() as session:
            profile = session.get(Profile, user_id)
            barrier.wait()
            try:
                order_service.create_order(
                    session, profile, OrderCreate(items=[{"variant_id": variant.id, "quantity": 1}]), clock.now()
                )
                session.commit()
                results.append("ok")
            except AppError as exc:
                session.rollback()
                results.append(exc.code)

    # Act
    threads = [threading.Thread(target=buy, args=(uid,)) for uid in buyers]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Assert
    assert sorted(results) == ["insufficient_stock", "ok"]
    db.expire_all()
    stored = db.get(ProductVariant, variant.id)
    assert (stored.stock_on_hand, stored.stock_reserved) == (1, 1)
    assert db.query(Payment).count() == 1


def test_order_creation_is_rate_limited(client, db, monkeypatch):
    # Arrange
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "rate_limit_per_minute", 2)
    user = new_user()
    variant = create_variant(db, stock=10)

    # Act
    codes = [place_order(client, user, variant.id).status_code for _ in range(3)]

    # Assert
    assert codes == [201, 201, 429]
