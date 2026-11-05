"""Solicitudes de S2 Box, activación, renovación y vencimiento. Mi Ruta es gratis: la membresía no condiciona el contenido."""

from datetime import datetime, timedelta

from app.models import AdminAuditLog, ContentItem
from tests.factories import create_admin, create_plan, new_user


def _plus_content(db) -> int:
    item = ContentItem(kind="meal", title="Desayuno del día", access="plus", body="Avena con frutos rojos")
    db.add(item)
    db.commit()
    return item.id


def _request(client, user, plan_code="plus-mensual"):
    return client.post("/api/v1/subscriptions/requests", json={"plan_code": plan_code}, headers=user.headers)


def _pay(client, admin, request: dict, price=60_000, days=30, ext=None):
    """Registra las condiciones acordadas y confirma el pago (flujo de administración)."""
    client.post(f"/api/v1/admin/subscription-requests/{request['id']}/terms",
                json={"agreed_price": price, "agreed_duration_days": days}, headers=admin.headers)
    pending = client.get("/api/v1/admin/subscription-requests", headers=admin.headers).json()
    payment_id = next(r["payment_id"] for r in pending if r["id"] == request["id"])
    return client.post(
        f"/api/v1/admin/payments/{payment_id}/confirm",
        json={"operation_reference": request["reference"], "amount": price, "method": "transfer",
              "external_reference": ext or f"CONV-{request['reference']}"},
        headers=admin.headers,
    )


def test_plan_without_price_is_listed_as_pending_definition(client, db):
    create_plan(db, price=None)
    plans = client.get("/api/v1/plans").json()
    assert plans[0]["price"] is None and plans[0]["code"] == "plus-mensual"


def test_subscription_request_requires_login(client, db):
    create_plan(db)
    assert client.post("/api/v1/subscriptions/requests", json={"plan_code": "plus-mensual"}).status_code == 401


def test_request_creates_reference_and_whatsapp_message(client, db):
    # Arrange
    create_plan(db)
    user = new_user()

    # Act
    response = _request(client, user)

    # Assert
    assert response.status_code == 201
    body = response.json()
    assert body["reference"].startswith("S2-SUB-")
    assert body["status"] == "pending_payment"
    assert body["kind"] == "new"
    assert "S2 Plus mensual" in body["whatsapp_message"]
    assert body["reference"] in body["whatsapp_message"]


def test_repeated_click_reuses_pending_request(client, db):
    create_plan(db)
    user = new_user()
    first, second = _request(client, user).json(), _request(client, user)
    assert second.status_code == 200
    assert second.json()["reference"] == first["reference"]
    assert second.json()["already_existed"] is True


def test_unknown_plan_is_rejected(client, db):
    assert _request(client, new_user(), "plan-inventado").status_code == 404


def test_pending_request_keeps_membership_inactive_but_content_stays_free(client, db):
    # Arrange
    create_plan(db)
    user = new_user()
    content_id = _plus_content(db)
    _request(client, user)

    # Act
    membership = client.get("/api/v1/subscriptions/me", headers=user.headers).json()
    content = client.get(f"/api/v1/content/{content_id}", headers=user.headers)
    listing = client.get("/api/v1/content", headers=user.headers).json()

    # Assert
    assert membership["is_active"] is False
    assert membership["pending_request"]["status"] == "pending_payment"
    assert content.status_code == 200 and content.json()["body"] == "Avena con frutos rojos"
    assert listing[0]["body"] == "Avena con frutos rojos"


def test_confirmation_requires_agreed_terms(client, db):
    # Arrange
    create_plan(db, price=60_000)
    admin, user = create_admin(db), new_user()
    request = _request(client, user).json()
    payment_id = client.get("/api/v1/admin/subscription-requests", headers=admin.headers).json()[0]["payment_id"]

    # Act
    response = client.post(
        f"/api/v1/admin/payments/{payment_id}/confirm",
        json={"operation_reference": request["reference"], "amount": 60_000, "method": "transfer",
              "external_reference": "CONV-1"},
        headers=admin.headers,
    )

    # Assert
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "agreed_terms_missing"


def test_confirmed_payment_activates_membership_and_unlocks_content(client, db, frozen_clock):
    # Arrange
    create_plan(db)
    admin, user = create_admin(db), new_user()
    content_id = _plus_content(db)
    request = _request(client, user).json()

    # Act
    confirmed = _pay(client, admin, request, price=60_000, days=30)
    membership = client.get("/api/v1/subscriptions/me", headers=user.headers).json()
    content = client.get(f"/api/v1/content/{content_id}", headers=user.headers)

    # Assert
    assert confirmed.status_code == 200
    assert membership["is_active"] is True
    sub = membership["subscription"]
    assert sub["status"] == "active"
    assert datetime.fromisoformat(sub["ends_at"]) - datetime.fromisoformat(sub["starts_at"]) == timedelta(days=30)
    assert sub["amount_paid"] == 60_000
    assert membership["pending_request"] is None
    assert content.status_code == 200 and content.json()["body"] == "Avena con frutos rojos"
    assert db.query(AdminAuditLog).filter_by(action="subscription_request.set_terms").count() == 1


def test_admin_panels_show_active_membership_after_confirming_payment(client, db, frozen_clock):
    # Arrange
    create_plan(db)
    admin, user = create_admin(db), new_user()
    request = _request(client, user).json()
    pending_before = client.get("/api/v1/admin/subscription-requests?status=pending_payment", headers=admin.headers).json()
    assert [r["id"] for r in pending_before] == [request["id"]]

    # Act
    confirmed = _pay(client, admin, request, price=60_000, days=30)
    subs = client.get("/api/v1/admin/subscriptions", headers=admin.headers).json()
    active = client.get("/api/v1/admin/subscriptions?status=active", headers=admin.headers).json()
    pending_after = client.get("/api/v1/admin/subscription-requests?status=pending_payment", headers=admin.headers).json()
    payments = client.get("/api/v1/admin/payments?status=confirmed", headers=admin.headers).json()

    # Assert
    assert confirmed.status_code == 200
    sub = next(s for s in subs if s["user_id"] == str(user.id))
    assert sub["status"] == "active" and sub["ends_at"] and sub["amount_paid"] == 60_000
    assert [s["id"] for s in active] == [sub["id"]]
    assert request["id"] not in [r["id"] for r in pending_after]
    payment = next(p for p in payments if p["subscription_request_id"] == request["id"])
    assert payment["status"] == "confirmed"
    assert datetime.fromisoformat(payment["subscription_ends_at"]) == datetime.fromisoformat(sub["ends_at"])
    assert datetime.fromisoformat(confirmed.json()["subscription_ends_at"]) == datetime.fromisoformat(sub["ends_at"])


def test_early_renewal_extends_from_current_end_date(client, db, frozen_clock):
    # Arrange
    create_plan(db)
    admin, user = create_admin(db), new_user()
    _pay(client, admin, _request(client, user).json(), days=30)
    frozen_clock.advance(days=20)

    # Act
    renewal = _request(client, user).json()
    _pay(client, admin, renewal, days=30)
    sub = client.get("/api/v1/subscriptions/me", headers=user.headers).json()["subscription"]

    # Assert
    assert renewal["kind"] == "renewal"
    assert datetime.fromisoformat(sub["ends_at"]) - datetime.fromisoformat(sub["starts_at"]) == timedelta(days=60)
    assert len(sub["renewals"]) == 2


def test_membership_expires_and_content_stays_available(client, db, frozen_clock):
    # Arrange
    create_plan(db)
    admin, user = create_admin(db), new_user()
    content_id = _plus_content(db)
    _pay(client, admin, _request(client, user).json(), days=30)

    # Act
    frozen_clock.advance(days=30, seconds=1)
    membership = client.get("/api/v1/subscriptions/me", headers=user.headers).json()
    content = client.get(f"/api/v1/content/{content_id}", headers=user.headers)

    # Assert
    assert membership["is_active"] is False
    assert membership["subscription"]["status"] == "expired"
    assert content.status_code == 200


def test_renewal_after_expiry_starts_a_new_period_today(client, db, frozen_clock):
    # Arrange
    create_plan(db)
    admin, user = create_admin(db), new_user()
    _pay(client, admin, _request(client, user).json(), days=30)
    frozen_clock.advance(days=45)
    renewal_day = frozen_clock.current

    # Act
    _pay(client, admin, _request(client, user).json(), days=30)
    sub = client.get("/api/v1/subscriptions/me", headers=user.headers).json()["subscription"]

    # Assert
    assert datetime.fromisoformat(sub["starts_at"]) == renewal_day
    assert datetime.fromisoformat(sub["ends_at"]) == renewal_day + timedelta(days=30)


def test_admin_cancellation_ends_membership_without_locking_content(client, db, frozen_clock):
    # Arrange
    create_plan(db)
    admin, user = create_admin(db), new_user()
    content_id = _plus_content(db)
    _pay(client, admin, _request(client, user).json())
    sub_id = client.get("/api/v1/subscriptions/me", headers=user.headers).json()["subscription"]["id"]

    # Act
    cancelled = client.post(f"/api/v1/admin/subscriptions/{sub_id}/cancel", json={"reason": "Solicitud de la clienta"},
                            headers=admin.headers)

    # Assert
    assert cancelled.status_code == 200
    assert client.get("/api/v1/subscriptions/me", headers=user.headers).json()["is_active"] is False
    assert client.get(f"/api/v1/content/{content_id}", headers=user.headers).status_code == 200
    assert db.query(AdminAuditLog).filter_by(action="subscription.cancel").count() == 1


def test_rejected_subscription_payment_does_not_activate(client, db):
    # Arrange
    create_plan(db)
    admin, user = create_admin(db), new_user()
    _request(client, user)
    payment_id = client.get("/api/v1/admin/subscription-requests", headers=admin.headers).json()[0]["payment_id"]

    # Act
    client.post(f"/api/v1/admin/payments/{payment_id}/reject", json={"admin_notes": "No llegó el dinero"},
                headers=admin.headers)
    membership = client.get("/api/v1/subscriptions/me", headers=user.headers).json()

    # Assert
    assert membership["is_active"] is False
    assert membership["pending_request"] is None


def test_customer_cannot_set_agreed_price(client, db):
    create_plan(db)
    user = new_user()
    request = _request(client, user).json()
    response = client.post(f"/api/v1/admin/subscription-requests/{request['id']}/terms",
                           json={"agreed_price": 1, "agreed_duration_days": 365}, headers=user.headers)
    assert response.status_code == 403


def test_users_cannot_see_other_memberships(client, db):
    create_plan(db)
    alice, bob = new_user(), new_user()
    _request(client, alice)
    assert client.get("/api/v1/subscriptions/me", headers=bob.headers).json()["pending_request"] is None
