"""Verificación manual de pagos de pedidos."""

import threading
import uuid

from app.core import clock
from app.core.database import SessionLocal
from app.core.errors import AppError
from app.models import AdminAuditLog, InventoryMovement, Profile
from app.schemas.payments import PaymentConfirm
from app.services import payments as payment_service
from tests.factories import create_admin, create_variant, new_user, payment_for, place_order


def _setup_order(client, db, stock=3, quantity=1):
    admin, user = create_admin(db), new_user()
    variant = create_variant(db, stock=stock, price=135_000)
    order = place_order(client, user, variant.id, quantity=quantity).json()
    payment = payment_for(client, admin, order["reference"])
    body = {"operation_reference": order["reference"], "amount": order["total"], "method": "transfer",
            "external_reference": f"BANCO-{uuid.uuid4().hex[:8]}"}
    return admin, user, variant, order, payment, body


def test_confirming_payment_marks_order_paid_and_discounts_stock(client, db):
    # Arrange
    admin, user, variant, order, payment, body = _setup_order(client, db, stock=3, quantity=2)

    # Act
    response = client.post(f"/api/v1/admin/payments/{payment['id']}/confirm", json=body, headers=admin.headers)

    # Assert
    assert response.status_code == 200
    confirmed = response.json()
    assert confirmed["status"] == "confirmed"
    assert confirmed["decided_by"] == str(admin.id)
    assert confirmed["decided_at"] is not None
    stored_order = client.get(f"/api/v1/orders/{order['reference']}", headers=user.headers).json()
    assert stored_order["status"] == "paid"
    db.refresh(variant)
    assert (variant.stock_on_hand, variant.stock_reserved) == (1, 0)
    log = db.query(AdminAuditLog).filter_by(action="payment.confirm").one()
    assert log.admin_id == admin.id and log.details["operation_reference"] == order["reference"]


def test_second_confirmation_has_no_effect(client, db):
    # Arrange
    admin, _, variant, _, payment, body = _setup_order(client, db, stock=3)
    client.post(f"/api/v1/admin/payments/{payment['id']}/confirm", json=body, headers=admin.headers)

    # Act
    again = client.post(f"/api/v1/admin/payments/{payment['id']}/confirm", json=body, headers=admin.headers)

    # Assert
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "payment_already_processed"
    db.refresh(variant)
    assert variant.stock_on_hand == 2
    assert db.query(InventoryMovement).filter_by(variant_id=variant.id, kind="sale").count() == 1


def test_simultaneous_confirmations_apply_effects_once(client, db):
    # Arrange
    admin, _, variant, _, payment, body = _setup_order(client, db, stock=3)
    barrier = threading.Barrier(2)
    results: list[str] = []

    def confirm():
        with SessionLocal() as session:
            profile = session.get(Profile, admin.id)
            barrier.wait()
            try:
                payment_service.confirm(session, uuid.UUID(payment["id"]), profile, PaymentConfirm(**body), clock.now())
                session.commit()
                results.append("ok")
            except AppError as exc:
                session.rollback()
                results.append(exc.code)

    # Act
    threads = [threading.Thread(target=confirm) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Assert
    assert sorted(results) == ["ok", "payment_already_processed"]
    db.refresh(variant)
    assert variant.stock_on_hand == 2


def test_amount_must_match_order_total(client, db):
    admin, _, _, _, payment, body = _setup_order(client, db)
    response = client.post(f"/api/v1/admin/payments/{payment['id']}/confirm", json={**body, "amount": 1000},
                           headers=admin.headers)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "amount_mismatch"


def test_reference_must_match_operation(client, db):
    admin, _, _, _, payment, body = _setup_order(client, db)
    response = client.post(f"/api/v1/admin/payments/{payment['id']}/confirm",
                           json={**body, "operation_reference": "S2-ORD-OTRA1234"}, headers=admin.headers)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "reference_mismatch"


def test_external_reference_cannot_confirm_two_payments(client, db):
    # Arrange
    admin, _, _, _, payment, body = _setup_order(client, db)
    client.post(f"/api/v1/admin/payments/{payment['id']}/confirm", json=body, headers=admin.headers)
    variant = create_variant(db)
    other_order = place_order(client, new_user(), variant.id).json()
    other_payment = payment_for(client, admin, other_order["reference"])

    # Act
    response = client.post(
        f"/api/v1/admin/payments/{other_payment['id']}/confirm",
        json={**body, "operation_reference": other_order["reference"], "amount": other_order["total"]},
        headers=admin.headers,
    )

    # Assert
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "external_reference_used"


def test_customer_cannot_confirm_payments(client, db):
    # Arrange
    _, user, variant, _, payment, body = _setup_order(client, db)

    # Act
    response = client.post(f"/api/v1/admin/payments/{payment['id']}/confirm", json=body, headers=user.headers)

    # Assert
    assert response.status_code == 403
    db.refresh(variant)
    assert variant.stock_reserved == 1 and variant.stock_on_hand == 3


def test_rejecting_payment_cancels_order_and_releases_stock(client, db):
    # Arrange
    admin, user, variant, order, payment, _ = _setup_order(client, db)

    # Act
    response = client.post(f"/api/v1/admin/payments/{payment['id']}/reject",
                           json={"admin_notes": "No se encontró el ingreso en el convenio"}, headers=admin.headers)

    # Assert
    assert response.status_code == 200 and response.json()["status"] == "rejected"
    assert client.get(f"/api/v1/orders/{order['reference']}", headers=user.headers).json()["status"] == "cancelled"
    db.refresh(variant)
    assert variant.stock_reserved == 0
    assert db.query(AdminAuditLog).filter_by(action="payment.reject").count() == 1


def test_rejected_payment_cannot_be_confirmed_later(client, db):
    admin, _, _, _, payment, body = _setup_order(client, db)
    client.post(f"/api/v1/admin/payments/{payment['id']}/reject", json={"admin_notes": "Sin ingreso"}, headers=admin.headers)
    response = client.post(f"/api/v1/admin/payments/{payment['id']}/confirm", json=body, headers=admin.headers)
    assert response.status_code == 409


def test_review_then_refund_flow(client, db):
    # Arrange
    admin, user, _, order, payment, body = _setup_order(client, db)

    # Act
    reviewed = client.post(f"/api/v1/admin/payments/{payment['id']}/review",
                           json={"method": "deposit", "admin_notes": "Cliente envió comprobante"}, headers=admin.headers)
    client.post(f"/api/v1/admin/payments/{payment['id']}/confirm", json=body, headers=admin.headers)
    refunded = client.post(f"/api/v1/admin/payments/{payment['id']}/refund",
                           json={"admin_notes": "Devolución por talla"}, headers=admin.headers)

    # Assert
    assert reviewed.json()["status"] == "in_review"
    assert refunded.json()["status"] == "refunded"
    assert client.get(f"/api/v1/orders/{order['reference']}", headers=user.headers).json()["status"] == "refunded"


def test_customer_sees_own_payment_history_only(client, db):
    # Arrange
    _, user, _, order, _, _ = _setup_order(client, db)

    # Act
    mine = client.get("/api/v1/me/payments", headers=user.headers).json()
    others = client.get("/api/v1/me/payments", headers=new_user().headers).json()

    # Assert
    assert [p["operation_reference"] for p in mine] == [order["reference"]]
    assert others == []
