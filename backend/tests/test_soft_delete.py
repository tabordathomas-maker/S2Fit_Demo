"""Eliminación lógica: se borra lo que solo tiene historial y se bloquea solo lo vigente."""

import os
import uuid
from datetime import timedelta

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.core.database import engine
from app.models import AdminAuditLog, Order, Plan, Product, ProductVariant, Subscription, SubscriptionRequest
from app.models.enums import OrderStatus, ReservationStatus
from tests.conftest import BACKEND_DIR, TEST_DATABASE_URL
from tests.factories import create_admin, create_plan, create_variant, new_user, place_order
from tests.test_subscriptions import _pay, _request

ADMIN = "/api/v1/admin"


def _sub_user(db, plan, status, ends_in_days):
    user = new_user()
    from app.models import Profile

    db.add(Profile(id=user.id, email=user.email, full_name="Clienta"))
    db.flush()
    now = __import__("app.core.clock", fromlist=["now"]).now()
    db.add(Subscription(user_id=user.id, plan_id=plan.id, status=status, starts_at=now - timedelta(days=60), ends_at=now + timedelta(days=ends_in_days)))
    db.commit()
    return user


def _plans(client, admin, **params):
    return client.get(f"{ADMIN}/plans", params=params, headers=admin.headers).json()


# ---------- planes ----------


def test_plan_without_references_is_really_deleted(client, db):
    # Arrange
    admin = create_admin(db)
    plan_id = create_plan(db).id

    # Act
    response = client.delete(f"{ADMIN}/plans/{plan_id}", headers=admin.headers)

    # Assert
    assert response.status_code == 204
    db.expire_all()
    assert db.get(Plan, plan_id) is None
    assert db.query(AdminAuditLog).filter_by(action="plan.delete", entity_id=str(plan_id)).count() == 1


def test_plan_with_only_history_is_soft_deleted_and_hidden_but_history_keeps_its_name(client, db, frozen_clock):
    # Arrange
    admin = create_admin(db)
    plan = create_plan(db)
    plan_id = plan.id
    _sub_user(db, plan, "cancelled", 10)
    expired_user = _sub_user(db, plan, "active", -5)  # «active» con fecha vencida: ya es histórica
    request = _request(client, new_user()).json()
    client.post(f"{ADMIN}/payments/{_payment_id(client, admin, request)}/reject", json={"admin_notes": "No llegó"}, headers=admin.headers)
    db.query(SubscriptionRequest).update({"status": "rejected"})
    db.query(Subscription).filter(Subscription.status == "pending_payment").update({"status": "cancelled"})
    db.commit()

    # Act
    response = client.delete(f"{ADMIN}/plans/{plan_id}", headers=admin.headers)

    # Assert
    assert response.status_code == 204
    db.expire_all()
    stored = db.get(Plan, plan_id)
    assert stored is not None and stored.deleted_at == frozen_clock() and stored.is_active is False
    assert client.get("/api/v1/plans").json() == []
    assert _plans(client, admin) == []
    assert [p["id"] for p in _plans(client, admin, include_deleted="true")] == [plan_id]
    names = {s["plan"]["name"] for s in client.get(f"{ADMIN}/subscriptions", headers=admin.headers).json()}
    assert names == {"S2 Plus mensual"}
    log = db.query(AdminAuditLog).filter_by(action="plan.soft_delete").one()
    assert log.entity_id == str(plan_id) and log.details["historical"]["subscriptions"] >= 2
    assert expired_user is not None


def _payment_id(client, admin, request):
    pending = client.get(f"{ADMIN}/subscription-requests", headers=admin.headers).json()
    return next(r["payment_id"] for r in pending if r["id"] == request["id"])


def test_plan_with_active_subscription_is_blocked_and_message_has_the_end_date(client, db, frozen_clock):
    # Arrange
    admin = create_admin(db)
    plan = create_plan(db)
    _sub_user(db, plan, "active", 30)

    # Act
    response = client.delete(f"{ADMIN}/plans/{plan.id}", headers=admin.headers)

    # Assert
    error = response.json()["error"]
    assert response.status_code == 409 and error["code"] == "RESOURCE_IN_USE"
    assert error["details"]["live"] == {"subscriptions_active": 1}
    assert error["message"].startswith("Este plan tiene 1 suscripción activa (vence el ")
    assert "ene 2026" in error["message"] or "feb 2026" in error["message"] or "mar 2026" in error["message"] or "abr 2026" in error["message"]
    assert db.get(Plan, plan.id) is not None


def test_overdue_active_subscription_counts_as_history_after_expire_overdue(client, db, frozen_clock):
    # Arrange
    admin = create_admin(db)
    plan = create_plan(db)
    plan_id = plan.id
    _sub_user(db, plan, "active", -1)

    # Act
    response = client.delete(f"{ADMIN}/plans/{plan_id}", headers=admin.headers)

    # Assert
    assert response.status_code == 204
    db.expire_all()
    assert db.get(Plan, plan_id).deleted_at is not None


def test_plan_with_pending_request_is_blocked(client, db):
    # Arrange
    admin, user = create_admin(db), new_user()
    plan = create_plan(db)
    _request(client, user)

    # Act
    response = client.delete(f"{ADMIN}/plans/{plan.id}", headers=admin.headers)

    # Assert
    assert response.status_code == 409
    assert response.json()["error"]["details"]["live"]["requests_pending"] == 1
    assert "1 solicitud esperando pago" in response.json()["error"]["message"]


def test_requesting_a_deleted_plan_returns_a_clear_409(client, db):
    # Arrange
    admin, user = create_admin(db), new_user()
    plan = create_plan(db)
    _sub_user(db, plan, "cancelled", 1)
    assert client.delete(f"{ADMIN}/plans/{plan.id}", headers=admin.headers).status_code == 204

    # Act
    response = _request(client, user)

    # Assert
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PLAN_UNAVAILABLE"
    assert "ya no está disponible" in response.json()["error"]["message"]


def test_restore_clears_deleted_at_and_shows_the_plan_again(client, db):
    # Arrange
    admin = create_admin(db)
    plan = create_plan(db)
    plan_id = plan.id
    _sub_user(db, plan, "cancelled", 1)
    client.delete(f"{ADMIN}/plans/{plan_id}", headers=admin.headers)

    # Act
    restored = client.post(f"{ADMIN}/plans/{plan_id}/restore", headers=admin.headers)

    # Assert
    assert restored.status_code == 200 and restored.json()["is_active"] is True
    db.expire_all()
    assert db.get(Plan, plan_id).deleted_at is None
    assert [p["code"] for p in client.get("/api/v1/plans").json()] == ["plus-mensual"]


def test_admin_plan_listing_reports_usage_and_in_use(client, db):
    # Arrange
    admin = create_admin(db)
    busy, quiet = create_plan(db), create_plan(db, code="trimestral")
    _sub_user(db, busy, "active", 20)
    _sub_user(db, busy, "cancelled", 5)

    # Act
    listing = {p["code"]: p for p in _plans(client, admin)}

    # Assert
    assert listing["plus-mensual"]["in_use"] is True
    assert listing["plus-mensual"]["usage"] == {"live": {"subscriptions_active": 1}, "historical": {"subscriptions": 1}}
    assert listing["trimestral"]["in_use"] is False and listing["trimestral"]["usage"] == {"live": {}, "historical": {}}
    assert quiet.id is not None


# ---------- productos y variantes ----------


def _order_in_status(client, db, variant, status, reservation):
    order = place_order(client, new_user(), variant.id).json()
    db.query(Order).filter(Order.reference == order["reference"]).update({"status": status, "reservation_status": reservation})
    db.commit()


def test_product_with_only_finished_orders_is_soft_deleted_and_public_page_is_404(client, db):
    # Arrange
    admin = create_admin(db)
    variant = create_variant(db, stock=9, name="Set viejo")
    product_id, slug = variant.product.id, variant.product.slug
    for status, reservation in [(OrderStatus.paid, ReservationStatus.consumed), (OrderStatus.cancelled, ReservationStatus.released), (OrderStatus.expired, ReservationStatus.released)]:
        _order_in_status(client, db, variant, status, reservation)

    # Act
    response = client.delete(f"{ADMIN}/products/{product_id}", headers=admin.headers)

    # Assert
    assert response.status_code == 204
    db.expire_all()
    assert db.get(Product, product_id).deleted_at is not None
    assert client.get(f"/api/v1/catalog/products/{slug}").status_code == 404
    assert client.get("/api/v1/catalog/products").json() == []
    assert client.get(f"{ADMIN}/products", headers=admin.headers).json() == []
    shown = client.get(f"{ADMIN}/products", params={"include_deleted": "true"}, headers=admin.headers).json()
    assert [p["id"] for p in shown] == [product_id]
    assert db.query(AdminAuditLog).filter_by(action="product.soft_delete", entity_id=str(product_id)).one().details == {"historical": {"orders": 3}}
    assert db.query(Order).count() == 3


def test_product_with_pending_order_and_active_reservation_is_blocked(client, db):
    # Arrange
    admin = create_admin(db)
    variant = create_variant(db, stock=9)
    place_order(client, new_user(), variant.id)

    # Act
    response = client.delete(f"{ADMIN}/products/{variant.product.id}", headers=admin.headers)

    # Assert
    error = response.json()["error"]
    assert response.status_code == 409 and error["code"] == "RESOURCE_IN_USE"
    assert error["details"]["live"] == {"orders_pending": 1}
    assert "1 pedido esperando pago con unidades reservadas" in error["message"]


def test_variant_soft_delete_and_listing_usage_without_per_row_queries(client, db):
    # Arrange
    admin = create_admin(db)
    old = create_variant(db, stock=5, name="Con historial")
    fresh = create_variant(db, stock=5, name="Sin pedidos")
    _order_in_status(client, db, old, OrderStatus.paid, ReservationStatus.consumed)
    from sqlalchemy import event

    statements: list[str] = []

    def record(conn, cursor, statement, *args):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)

    # Act
    try:
        listing = client.get(f"{ADMIN}/products", headers=admin.headers).json()
    finally:
        event.remove(engine, "before_cursor_execute", record)
    selects = len([s for s in statements if s.lstrip().upper().startswith("SELECT")])
    deleted = client.delete(f"{ADMIN}/variants/{old.id}", headers=admin.headers)

    # Assert
    by_name = {p["name"]: p for p in listing}
    assert by_name["Con historial"]["usage"] == {"live": {}, "historical": {"orders": 1}} and by_name["Con historial"]["in_use"] is False
    assert by_name["Con historial"]["variants"][0]["usage"]["historical"] == {"orders": 1}
    assert by_name["Sin pedidos"]["usage"] == {"live": {}, "historical": {}}
    assert selects <= 12  # no crece con el número de filas
    assert deleted.status_code == 204
    db.expire_all()
    assert db.get(ProductVariant, old.id).deleted_at is not None
    assert db.get(ProductVariant, fresh.id).deleted_at is None


def test_soft_deleted_product_cannot_be_ordered_and_restore_brings_it_back(client, db):
    # Arrange
    admin = create_admin(db)
    variant = create_variant(db, stock=9)
    product_id = variant.product.id
    _order_in_status(client, db, variant, OrderStatus.paid, ReservationStatus.consumed)
    client.delete(f"{ADMIN}/products/{product_id}", headers=admin.headers)

    # Act
    blocked = place_order(client, new_user(), variant.id)
    restored = client.post(f"{ADMIN}/products/{product_id}/restore", headers=admin.headers)

    # Assert
    assert blocked.status_code == 409 and "ya no está disponible" in blocked.json()["error"]["message"]
    assert restored.status_code == 200
    db.expire_all()
    assert db.get(Product, product_id).deleted_at is None


def test_soft_delete_routes_401_403(client, db):
    # Arrange
    missing = uuid.uuid4()
    customer = new_user()

    # Act / Assert
    assert client.delete(f"{ADMIN}/plans/1").status_code == 401
    assert client.delete(f"{ADMIN}/plans/1", headers=customer.headers).status_code == 403
    assert client.get(f"{ADMIN}/plans", params={"include_deleted": "true"}, headers=customer.headers).status_code == 403
    assert missing is not None


def test_migration_0007_adds_and_drops_deleted_at():
    # Arrange
    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    cfg.attributes["database_url"] = TEST_DATABASE_URL
    engine.dispose()

    # Act / Assert
    try:
        command.downgrade(cfg, "0006")
        for table in ("plans", "products", "product_variants"):
            assert "deleted_at" not in {c["name"] for c in inspect(engine).get_columns(table)}
    finally:
        engine.dispose()
        command.upgrade(cfg, "head")
    engine.dispose()
    for table in ("plans", "products", "product_variants"):
        assert "deleted_at" in {c["name"] for c in inspect(engine).get_columns(table)}
