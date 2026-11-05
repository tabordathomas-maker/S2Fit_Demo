"""CRUD de planes, solicitudes y suscripciones de S2 Box desde el panel."""

from datetime import timedelta

from app.models import AdminAuditLog, Payment, Plan, SubscriptionRequest
from tests.factories import create_admin, create_plan, new_user
from tests.test_subscriptions import _pay, _request

BASE = "/api/v1/admin"


def _requested(client, db):
    admin, user = create_admin(db), new_user()
    create_plan(db)
    request = _request(client, user).json()
    return admin, user, request


def test_patch_plan_updates_only_sent_fields_and_audits(client, db):
    # Arrange
    admin = create_admin(db)
    plan = create_plan(db, price=60_000)

    # Act
    response = client.patch(f"{BASE}/plans/{plan.id}", json={"price": 70_000, "description": "Caja mensual"}, headers=admin.headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["price"] == 70_000 and body["description"] == "Caja mensual" and body["duration_days"] == 30
    log = db.query(AdminAuditLog).filter_by(action="plan.update").one()
    assert log.entity_id == str(plan.id) and log.details["changed_fields"] == ["description", "price"]
    assert log.details["before"]["price"] == 60_000


def test_patch_plan_rejects_extra_and_invalid_fields(client, db):
    # Arrange
    admin = create_admin(db)
    plan = create_plan(db)
    url = f"{BASE}/plans/{plan.id}"

    # Act / Assert
    assert client.patch(url, json={"slug": "otro"}, headers=admin.headers).status_code == 422
    assert client.patch(url, json={"duration_days": 0}, headers=admin.headers).status_code == 422
    assert client.patch(url, json={"price": -5}, headers=admin.headers).status_code == 422


def test_archive_plan_hides_it_from_s2box_page_and_restore_shows_it(client, db):
    # Arrange
    admin = create_admin(db)
    plan = create_plan(db)
    codes = lambda: [p["code"] for p in client.get("/api/v1/plans").json()]  # noqa: E731

    # Act
    archived = client.post(f"{BASE}/plans/{plan.id}/archive", headers=admin.headers)
    hidden = codes()
    admin_default = client.get(f"{BASE}/plans", headers=admin.headers).json()
    admin_all = client.get(f"{BASE}/plans", params={"include_archived": "true"}, headers=admin.headers).json()
    restored = client.post(f"{BASE}/plans/{plan.id}/restore", headers=admin.headers)

    # Assert
    assert archived.json()["is_active"] is False and hidden == []
    assert admin_default == [] and [p["id"] for p in admin_all] == [plan.id]
    assert restored.json()["is_active"] is True and codes() == ["plus-mensual"]


def test_delete_plan_without_references_is_real_and_with_requests_is_409(client, db):
    # Arrange
    admin, user = create_admin(db), new_user()
    used = create_plan(db)
    free = create_plan(db, code="trimestral")
    free_id = free.id
    _request(client, user)

    # Act
    blocked = client.delete(f"{BASE}/plans/{used.id}", headers=admin.headers)
    deleted = client.delete(f"{BASE}/plans/{free_id}", headers=admin.headers)

    # Assert
    error = blocked.json()["error"]
    assert blocked.status_code == 409 and error["code"] == "RESOURCE_IN_USE"
    assert error["details"]["live"] == {"subscriptions_pending": 1, "requests_pending": 1} and "archivarlo" in error["message"]
    assert deleted.status_code == 204
    db.expire_all()
    assert db.get(Plan, free_id) is None


def test_patch_pending_request_terms_updates_agreed_price_and_payment_amount(client, db):
    # Arrange
    admin, _, request = _requested(client, db)

    # Act
    response = client.patch(f"{BASE}/subscription-requests/{request['id']}", json={"agreed_price": 55_000}, headers=admin.headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["agreed_price"] == 55_000 and body["agreed_duration_days"] is None
    assert db.query(Payment).one().amount == 55_000
    log = db.query(AdminAuditLog).filter_by(action="subscription_request.update").one()
    assert log.details["changed_fields"] == ["agreed_price"]


def test_patch_request_rejects_extra_invalid_and_paid_requests(client, db):
    # Arrange
    admin, _, request = _requested(client, db)
    url = f"{BASE}/subscription-requests/{request['id']}"
    assert _pay(client, admin, request).status_code == 200

    # Act / Assert
    assert client.patch(url, json={"status": "paid"}, headers=admin.headers).status_code == 422
    assert client.patch(url, json={"agreed_price": 0}, headers=admin.headers).status_code == 422
    locked = client.patch(url, json={"agreed_price": 10_000}, headers=admin.headers)
    assert locked.status_code == 409 and locked.json()["error"]["code"] == "REQUEST_LOCKED"


def test_delete_pending_request_removes_its_payment_but_paid_request_is_locked(client, db):
    # Arrange
    admin, _, pending = _requested(client, db)
    other_user = new_user()
    paid = _request(client, other_user).json()
    assert _pay(client, admin, paid).status_code == 200

    # Act
    deleted = client.delete(f"{BASE}/subscription-requests/{pending['id']}", headers=admin.headers)
    locked = client.delete(f"{BASE}/subscription-requests/{paid['id']}", headers=admin.headers)

    # Assert
    assert deleted.status_code == 204
    assert locked.status_code == 409 and locked.json()["error"]["code"] == "REQUEST_LOCKED"
    db.expire_all()
    assert db.query(SubscriptionRequest).count() == 1 and db.query(Payment).count() == 1
    assert db.query(AdminAuditLog).filter_by(action="subscription_request.delete", entity_id=pending["id"]).count() == 1


def _active_subscription(client, db):
    admin, user = create_admin(db), new_user()
    create_plan(db)
    request = _request(client, user).json()
    assert _pay(client, admin, request).status_code == 200
    sub = client.get(f"{BASE}/subscriptions", headers=admin.headers).json()[0]
    return admin, sub


def test_patch_subscription_dates_audits_and_validates_order(client, db, frozen_clock):
    # Arrange
    admin, sub = _active_subscription(client, db)
    new_end = (frozen_clock() + timedelta(days=90)).isoformat()

    # Act
    ok = client.patch(f"{BASE}/subscriptions/{sub['id']}", json={"ends_at": new_end}, headers=admin.headers)
    inverted = client.patch(f"{BASE}/subscriptions/{sub['id']}", json={"ends_at": (frozen_clock() - timedelta(days=5)).isoformat()}, headers=admin.headers)
    extra = client.patch(f"{BASE}/subscriptions/{sub['id']}", json={"status": "active"}, headers=admin.headers)

    # Assert
    assert ok.status_code == 200 and ok.json()["ends_at"].startswith(new_end[:10])
    assert inverted.status_code == 422 and inverted.json()["error"]["code"] == "invalid_dates"
    assert extra.status_code == 422
    log = db.query(AdminAuditLog).filter_by(action="subscription.update").one()
    assert log.details["changed_fields"] == ["ends_at"]


def test_cancelled_subscription_dates_are_locked(client, db):
    # Arrange
    admin, sub = _active_subscription(client, db)
    client.post(f"{BASE}/subscriptions/{sub['id']}/cancel", json={"reason": "Pedido de la clienta"}, headers=admin.headers)

    # Act
    response = client.patch(f"{BASE}/subscriptions/{sub['id']}", json={"ends_at": "2030-01-01T00:00:00Z"}, headers=admin.headers)

    # Assert
    assert response.status_code == 409 and response.json()["error"]["code"] == "SUBSCRIPTION_LOCKED"


def test_s2box_routes_404_401_403(client, db):
    # Arrange
    admin, customer = create_admin(db), new_user()
    missing = "00000000-0000-0000-0000-000000000000"

    # Act / Assert
    for method, path in [("delete", "/plans/9999"), ("post", "/plans/9999/archive"), ("post", "/plans/9999/restore"),
                         ("delete", f"/subscription-requests/{missing}")]:
        call = getattr(client, method)
        assert call(f"{BASE}{path}", headers=admin.headers).status_code == 404, path
        assert call(f"{BASE}{path}").status_code == 401, path
        assert call(f"{BASE}{path}", headers=customer.headers).status_code == 403, path
    for path, body in [("/plans/9999", {"name": "Nuevo"}), (f"/subscription-requests/{missing}", {"agreed_price": 5}),
                       (f"/subscriptions/{missing}", {"ends_at": "2030-01-01T00:00:00Z"})]:
        assert client.patch(f"{BASE}{path}", json=body, headers=admin.headers).status_code == 404, path
        assert client.patch(f"{BASE}{path}", json=body).status_code == 401, path
        assert client.patch(f"{BASE}{path}", json=body, headers=customer.headers).status_code == 403, path
