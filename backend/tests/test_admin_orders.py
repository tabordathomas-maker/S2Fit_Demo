"""CRUD de pedidos y pagos desde el panel: editar ítems, cancelar, eliminar."""

import uuid

from app.models import AdminAuditLog, Order, Payment
from tests.factories import create_admin, create_variant, new_user, payment_for, place_order

BASE = "/api/v1/admin"


def _pending(client, db, stock=5, quantity=1):
    admin, user = create_admin(db), new_user()
    variant = create_variant(db, stock=stock, price=100_000)
    order = place_order(client, user, variant.id, quantity=quantity).json()
    return admin, user, variant, order


def _pay(client, admin, order):
    payment = payment_for(client, admin, order["reference"])
    body = {"operation_reference": order["reference"], "amount": order["total"], "method": "transfer",
            "external_reference": f"BANCO-{uuid.uuid4().hex[:8]}"}
    assert client.post(f"{BASE}/payments/{payment['id']}/confirm", json=body, headers=admin.headers).status_code == 200
    return payment


def _stock(db, variant):
    db.refresh(variant)
    return variant.stock_on_hand, variant.stock_reserved


def test_patch_order_note_only_changes_sent_fields_and_audits(client, db):
    # Arrange
    admin, _, variant, order = _pending(client, db, quantity=2)

    # Act
    response = client.patch(f"{BASE}/orders/{order['id']}", json={"customer_note": "Entregar en la tarde"}, headers=admin.headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["customer_note"] == "Entregar en la tarde"
    assert body["items"][0]["quantity"] == 2 and body["reference"] == order["reference"]
    log = db.query(AdminAuditLog).filter_by(action="order.update").one()
    assert log.entity_id == order["id"] and log.details["changed_fields"] == ["customer_note"]


def test_patch_order_rejects_extra_and_invalid_fields(client, db):
    # Arrange
    admin, _, variant, order = _pending(client, db)
    url = f"{BASE}/orders/{order['id']}"

    # Act
    extra = client.patch(url, json={"total": 1}, headers=admin.headers)
    invalid = client.patch(url, json={"items": [{"variant_id": variant.id, "quantity": 0}]}, headers=admin.headers)
    empty = client.patch(url, json={"items": []}, headers=admin.headers)

    # Assert
    assert extra.status_code == invalid.status_code == empty.status_code == 422


def test_editing_items_adjusts_reservation_and_totals(client, db):
    # Arrange
    admin, _, variant, order = _pending(client, db, stock=5, quantity=1)
    other = create_variant(db, stock=3, price=50_000)
    assert _stock(db, variant) == (5, 1)

    # Act
    response = client.patch(
        f"{BASE}/orders/{order['id']}",
        json={"items": [{"variant_id": variant.id, "quantity": 3}, {"variant_id": other.id, "quantity": 2}]},
        headers=admin.headers,
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3 * 100_000 + 2 * 50_000
    assert _stock(db, variant) == (5, 3) and _stock(db, other) == (3, 2)
    assert body["payment"]["amount"] == body["total"]

    # Act: se quita una variante y se baja la cantidad de la otra
    again = client.patch(f"{BASE}/orders/{order['id']}", json={"items": [{"variant_id": other.id, "quantity": 1}]}, headers=admin.headers)

    # Assert
    assert again.status_code == 200 and again.json()["total"] == 50_000
    assert _stock(db, variant) == (5, 0) and _stock(db, other) == (3, 1)


def test_editing_items_without_stock_returns_409_and_changes_nothing(client, db):
    # Arrange
    admin, _, variant, order = _pending(client, db, stock=2, quantity=1)

    # Act
    response = client.patch(f"{BASE}/orders/{order['id']}", json={"items": [{"variant_id": variant.id, "quantity": 4}]}, headers=admin.headers)

    # Assert
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "STOCK_INSUFFICIENT"
    assert _stock(db, variant) == (2, 1)
    stored = client.get(f"{BASE}/orders/{order['id']}", headers=admin.headers).json()
    assert stored["total"] == 100_000 and stored["items"][0]["quantity"] == 1


def test_paid_order_items_are_locked_but_notes_can_change(client, db):
    # Arrange
    admin, _, variant, order = _pending(client, db, stock=5)
    _pay(client, admin, order)
    url = f"{BASE}/orders/{order['id']}"

    # Act
    items = client.patch(url, json={"items": [{"variant_id": variant.id, "quantity": 2}]}, headers=admin.headers)
    note = client.patch(url, json={"customer_note": "Entregado"}, headers=admin.headers)

    # Assert
    assert items.status_code == 409 and items.json()["error"]["code"] == "ORDER_LOCKED"
    assert note.status_code == 200 and note.json()["customer_note"] == "Entregado"
    assert _stock(db, variant) == (4, 0)


def test_cancel_with_optional_reason_releases_reservation_and_only_once(client, db):
    # Arrange
    admin, _, variant, order = _pending(client, db, stock=3, quantity=2)

    # Act
    first = client.post(f"{BASE}/orders/{order['id']}/cancel", json={}, headers=admin.headers)
    second = client.post(f"{BASE}/orders/{order['id']}/cancel", json={"reason": "Duplicado"}, headers=admin.headers)

    # Assert
    assert first.status_code == 200 and first.json()["status"] == "cancelled"
    assert second.status_code == 409
    assert _stock(db, variant) == (3, 0)


def test_delete_pending_order_releases_reservation_and_removes_payment(client, db):
    # Arrange
    admin, _, variant, order = _pending(client, db, stock=3, quantity=2)

    # Act
    response = client.delete(f"{BASE}/orders/{order['id']}", headers=admin.headers)

    # Assert
    assert response.status_code == 204
    assert _stock(db, variant) == (3, 0)
    assert db.query(Order).count() == 0 and db.query(Payment).count() == 0
    log = db.query(AdminAuditLog).filter_by(action="order.delete").one()
    assert log.entity_id == order["id"] and log.details["reference"] == order["reference"]
    assert client.get(f"{BASE}/orders/{order['id']}", headers=admin.headers).status_code == 404


def test_delete_cancelled_order_works_without_releasing_twice(client, db):
    # Arrange
    admin, _, variant, order = _pending(client, db, stock=3, quantity=2)
    client.post(f"{BASE}/orders/{order['id']}/cancel", json={}, headers=admin.headers)

    # Act
    response = client.delete(f"{BASE}/orders/{order['id']}", headers=admin.headers)

    # Assert
    assert response.status_code == 204
    assert _stock(db, variant) == (3, 0)


def test_paid_order_cannot_be_deleted(client, db):
    # Arrange
    admin, _, variant, order = _pending(client, db, stock=3)
    _pay(client, admin, order)

    # Act
    response = client.delete(f"{BASE}/orders/{order['id']}", headers=admin.headers)

    # Assert
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "ORDER_LOCKED"
    assert error["message"] == "Los pedidos pagados no se eliminan; puedes cancelarlos o cambiar su estado."
    assert db.query(Order).count() == 1


def test_order_routes_404_401_403(client, db):
    # Arrange
    admin, customer = create_admin(db), new_user()
    missing = uuid.uuid4()

    # Act / Assert
    assert client.patch(f"{BASE}/orders/{missing}", json={"customer_note": "x"}, headers=admin.headers).status_code == 404
    assert client.delete(f"{BASE}/orders/{missing}", headers=admin.headers).status_code == 404
    assert client.delete(f"{BASE}/orders/{missing}").status_code == 401
    assert client.patch(f"{BASE}/orders/{missing}", json={}).status_code == 401
    assert client.delete(f"{BASE}/orders/{missing}", headers=customer.headers).status_code == 403
    assert client.patch(f"{BASE}/orders/{missing}", json={}, headers=customer.headers).status_code == 403


def test_patch_pending_payment_updates_only_sent_fields_and_audits(client, db):
    # Arrange
    admin, _, _, order = _pending(client, db)
    payment = payment_for(client, admin, order["reference"])

    # Act
    response = client.patch(f"{BASE}/payments/{payment['id']}", json={"amount": 90_000}, headers=admin.headers)

    # Assert
    assert response.status_code == 200
    assert response.json()["amount"] == 90_000 and response.json()["admin_notes"] is None
    log = db.query(AdminAuditLog).filter_by(action="payment.update").one()
    assert log.entity_id == payment["id"] and log.details["changed_fields"] == ["amount"]


def test_patch_payment_rejects_extra_and_invalid(client, db):
    # Arrange
    admin, _, _, order = _pending(client, db)
    url = f"{BASE}/payments/{payment_for(client, admin, order['reference'])['id']}"

    # Act / Assert
    assert client.patch(url, json={"status": "confirmed"}, headers=admin.headers).status_code == 422
    assert client.patch(url, json={"amount": -5}, headers=admin.headers).status_code == 422


def test_confirmed_payment_cannot_be_edited_or_deleted(client, db):
    # Arrange
    admin, _, _, order = _pending(client, db)
    payment = _pay(client, admin, order)
    url = f"{BASE}/payments/{payment['id']}"

    # Act
    edit = client.patch(url, json={"admin_notes": "x"}, headers=admin.headers)
    delete = client.delete(url, headers=admin.headers)

    # Assert
    assert edit.status_code == delete.status_code == 409
    assert delete.json()["error"]["code"] == "PAYMENT_LOCKED"
    assert db.query(Payment).count() == 1


def test_unconfirmed_payment_of_cancelled_order_can_be_deleted_but_not_of_pending_one(client, db):
    # Arrange
    admin, _, _, order = _pending(client, db)
    payment = payment_for(client, admin, order["reference"])
    url = f"{BASE}/payments/{payment['id']}"

    # Act
    blocked = client.delete(url, headers=admin.headers)
    client.post(f"{BASE}/orders/{order['id']}/cancel", json={}, headers=admin.headers)
    allowed = client.delete(url, headers=admin.headers)

    # Assert
    assert blocked.status_code == 409
    assert allowed.status_code == 204
    assert db.query(Payment).count() == 0
    assert client.delete(url, headers=admin.headers).status_code == 404


def test_payment_routes_401_403(client, db):
    # Arrange
    customer = new_user()
    missing = uuid.uuid4()

    # Act / Assert
    assert client.delete(f"{BASE}/payments/{missing}").status_code == 401
    assert client.patch(f"{BASE}/payments/{missing}", json={}, headers=customer.headers).status_code == 403
