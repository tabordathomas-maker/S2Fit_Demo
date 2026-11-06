"""Campanita: notificaciones derivadas de pedidos, solicitudes de membresía y reclamos."""

import uuid
from datetime import timedelta

from app.core import clock
from app.main import app
from app.models import BoxClaim, Order, Subscription, SubscriptionRequest
from tests.factories import create_admin, create_plan, create_variant, new_user, payment_for, place_order


def _confirm_body(order: dict) -> dict:
    return {"operation_reference": order["reference"], "amount": order["total"], "method": "transfer",
            "external_reference": f"BANCO-{uuid.uuid4().hex[:8]}"}


def _feed(client, user):
    response = client.get("/api/v1/notifications", headers=user.headers)
    assert response.status_code == 200
    return response.json()


def _order_with_payment(client, db):
    admin, user = create_admin(db), new_user()
    variant = create_variant(db, stock=3, price=135_000)
    order = place_order(client, user, variant.id).json()
    return admin, user, order, payment_for(client, admin, order["reference"])


def test_customer_sees_confirmed_order_as_accepted_and_unread(client, db, frozen_clock):
    # Arrange
    admin, user, order, payment = _order_with_payment(client, db)
    assert _feed(client, user)["unread_count"] == 0  # pendiente: no es "no leído"
    frozen_clock.advance(minutes=5)
    client.post(f"/api/v1/admin/payments/{payment['id']}/confirm", json=_confirm_body(order), headers=admin.headers)

    # Act
    feed = _feed(client, user)

    # Assert
    item = feed["items"][0]
    assert (item["id"], item["status"], item["status_label"], item["unread"]) == (
        f"order:{order['reference']}", "accepted", "Aceptado", True)
    assert item["link"] == "/pedidos"
    assert feed["unread_count"] == 1


def test_customer_sees_rejected_payment_as_cancelled_order(client, db, frozen_clock):
    # Arrange
    admin, user, order, payment = _order_with_payment(client, db)
    frozen_clock.advance(minutes=5)
    client.post(f"/api/v1/admin/payments/{payment['id']}/reject", json={"admin_notes": "No llegó el dinero"},
                headers=admin.headers)

    # Act
    item = _feed(client, user)["items"][0]

    # Assert
    assert (item["status"], item["status_label"], item["unread"]) == ("rejected", "Cancelado", True)


def test_seen_resets_customer_unread_count(client, db, frozen_clock):
    # Arrange
    admin, user, order, payment = _order_with_payment(client, db)
    frozen_clock.advance(minutes=5)
    client.post(f"/api/v1/admin/payments/{payment['id']}/confirm", json=_confirm_body(order), headers=admin.headers)
    assert _feed(client, user)["unread_count"] == 1

    # Act
    seen = client.post("/api/v1/notifications/seen", headers=user.headers)

    # Assert
    assert seen.status_code == 200
    assert seen.json()["unread_count"] == 0
    assert _feed(client, user)["unread_count"] == 0


def test_customer_does_not_see_other_users_data(client, db, frozen_clock):
    # Arrange
    _, _, order, _ = _order_with_payment(client, db)
    other = new_user()
    client.get("/api/v1/me", headers=other.headers)

    # Act
    feed = _feed(client, other)

    # Assert
    assert feed == {"items": [], "unread_count": 0}


def test_customer_sees_subscription_request_and_claim_states(client, db, frozen_clock):
    # Arrange
    admin, user = create_admin(db), new_user()
    create_plan(db, price=80_000)
    client.get("/api/v1/me", headers=user.headers)
    request = client.post("/api/v1/subscriptions/requests", json={"plan_code": "plus-mensual"}, headers=user.headers).json()
    db.add(BoxClaim(reference="S2-BOX-ACEPTADO", user_id=user.id, status="accepted",
                    created_at=clock.now() - timedelta(hours=2), decided_at=clock.now() - timedelta(hours=1)))
    db.commit()

    # Act
    items = {i["id"]: i for i in _feed(client, user)["items"]}

    # Assert
    assert items[f"subscription:{request['reference']}"]["status"] == "pending"
    assert items["box_claim:S2-BOX-ACEPTADO"]["status_label"] == "Aceptado"
    assert items["box_claim:S2-BOX-ACEPTADO"]["unread"] is True


def test_admin_sees_new_pending_items_and_seen_clears_unread(client, db, frozen_clock):
    # Arrange
    admin, user = create_admin(db), new_user()
    variant = create_variant(db, stock=3)
    create_plan(db, price=80_000)
    order = place_order(client, user, variant.id).json()
    request = client.post("/api/v1/subscriptions/requests", json={"plan_code": "plus-mensual"}, headers=user.headers).json()
    # created_at explícito: el valor por defecto usa la hora de la base y no la hora simulada.
    db.query(SubscriptionRequest).update({"created_at": clock.now()})
    db.add(BoxClaim(reference="S2-BOX-PENDIENTE", user_id=user.id, created_at=clock.now()))
    db.commit()
    db.query(Order).update({"created_at": clock.now()})
    db.commit()
    frozen_clock.advance(minutes=1)

    # Act
    feed = _feed(client, admin)

    # Assert
    ids = {i["id"]: i for i in feed["items"]}
    assert set(ids) == {f"order:{order['reference']}", f"subscription:{request['reference']}", "box_claim:S2-BOX-PENDIENTE"}
    assert feed["unread_count"] == 3
    assert ids[f"order:{order['reference']}"]["link"] == "/admin?tab=pedidos"
    assert ids[f"subscription:{request['reference']}"]["link"] == "/admin?tab=pagos"
    after = client.post("/api/v1/notifications/seen", headers=admin.headers).json()
    assert after["unread_count"] == 0
    assert len(after["items"]) == 3  # siguen pendientes, solo dejan de contar como nuevos


def test_admin_feed_excludes_paid_orders(client, db, frozen_clock):
    # Arrange
    admin, user, order, payment = _order_with_payment(client, db)
    client.post(f"/api/v1/admin/payments/{payment['id']}/confirm", json=_confirm_body(order), headers=admin.headers)

    # Act
    feed = _feed(client, admin)

    # Assert
    assert feed["items"] == []


def test_notifications_require_login(client):
    assert client.get("/api/v1/notifications").status_code == 401
    assert client.post("/api/v1/notifications/seen").status_code == 401


def test_routes_called_by_frontend_exist():
    paths = {(route.path, method) for route in app.routes for method in getattr(route, "methods", ())}
    assert ("/api/v1/notifications", "GET") in paths
    assert ("/api/v1/notifications/seen", "POST") in paths


def test_box_claim_flow_creates_pending_claim_and_notifies_customer(client, db, frozen_clock):
    # Arrange
    admin, user = create_admin(db), new_user()
    client.get("/api/v1/me", headers=user.headers)
    no_membership = client.post("/api/v1/s2box/claims", json={}, headers=user.headers)
    plan = create_plan(db, price=80_000)
    db.add(Subscription(user_id=user.id, plan_id=plan.id, status="active",
                        starts_at=clock.now() - timedelta(days=1), ends_at=clock.now() + timedelta(days=29)))
    db.commit()

    # Act
    created = client.post("/api/v1/s2box/claims", json={"customer_note": "Talla M"}, headers=user.headers)
    duplicate = client.post("/api/v1/s2box/claims", json={}, headers=user.headers)
    frozen_clock.advance(minutes=3)
    decided = client.post(f"/api/v1/admin/s2box/claims/{created.json()['id']}/accept", json={}, headers=admin.headers)

    # Assert
    assert no_membership.status_code == 409 and no_membership.json()["error"]["code"] == "membership_required"
    assert created.status_code == 201 and created.json()["reference"].startswith("S2-BOX-")
    assert duplicate.status_code == 409
    assert decided.status_code == 200 and decided.json()["status"] == "accepted"
    item = _feed(client, user)["items"][0]
    assert (item["kind"], item["status"], item["unread"]) == ("box_claim", "accepted", True)
