"""S2 Plus manual desde el panel: activar, extender y cancelar con motivo y auditoría."""

import uuid
from datetime import timedelta

from sqlalchemy import select

from app.models import AdminAuditLog, Profile, Subscription
from app.models.enums import SubscriptionStatus
from app.services.subscriptions import has_active_membership
from tests.factories import create_admin, create_plan, new_user


def _target(db) -> Profile:
    user = new_user()
    profile = Profile(id=user.id, email=user.email, full_name="Laura Gómez")
    db.add(profile)
    db.commit()
    return profile


def _url(user_id, action="") -> str:
    return f"/api/v1/admin/users/{user_id}/membership{action}"


def _grant(client, admin, user_id, days=30, reason="Cortesía"):
    return client.post(_url(user_id, "/grant"), json={"days": days, "reason": reason}, headers=admin.headers)


def _cancel(client, admin, user_id, reason="Fin de prueba"):
    return client.post(_url(user_id, "/cancel"), json={"reason": reason}, headers=admin.headers)


def _sub(db, user_id) -> Subscription:
    db.expire_all()
    return db.scalars(select(Subscription).where(Subscription.user_id == user_id)).one()


def test_grant_to_user_without_membership_activates_it(client, db, frozen_clock):
    admin, target = create_admin(db), _target(db)
    create_plan(db)

    response = _grant(client, admin, target.id, days=30)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "active" and body["is_active"] is True and body["plan_name"] == "S2 Plus mensual"
    sub = _sub(db, target.id)
    assert sub.ends_at == frozen_clock() + timedelta(days=30)
    assert sub.last_payment_reference == "MANUAL-ADMIN"
    assert has_active_membership(db, target.id, frozen_clock()) is True


def test_grant_to_current_membership_extends_from_its_end(client, db, frozen_clock):
    admin, target = create_admin(db), _target(db)
    create_plan(db)
    _grant(client, admin, target.id, days=30)

    _grant(client, admin, target.id, days=10)

    assert _sub(db, target.id).ends_at == frozen_clock() + timedelta(days=40)


def test_grant_to_expired_membership_starts_from_now(client, db, frozen_clock):
    admin, target = create_admin(db), _target(db)
    create_plan(db)
    _grant(client, admin, target.id, days=30)
    frozen_clock.advance(days=45)

    _grant(client, admin, target.id, days=15)

    assert _sub(db, target.id).ends_at == frozen_clock() + timedelta(days=15)


def test_grant_to_cancelled_membership_starts_from_now_and_clears_cancellation(client, db, frozen_clock):
    admin, target = create_admin(db), _target(db)
    create_plan(db)
    _grant(client, admin, target.id, days=30)
    _cancel(client, admin, target.id)
    frozen_clock.advance(days=5)

    _grant(client, admin, target.id, days=20)

    sub = _sub(db, target.id)
    assert sub.status == SubscriptionStatus.active and sub.cancelled_at is None
    assert sub.ends_at == frozen_clock() + timedelta(days=20)


def test_grant_without_active_plan_returns_409(client, db):
    admin, target = create_admin(db), _target(db)

    response = _grant(client, admin, target.id)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "plans_missing"
    assert "Primero crea un plan" in response.json()["error"]["message"]


def test_cancel_active_membership_revokes_access(client, db, frozen_clock):
    admin, target = create_admin(db), _target(db)
    create_plan(db)
    _grant(client, admin, target.id)

    response = _cancel(client, admin, target.id)

    assert response.status_code == 200 and response.json()["status"] == "cancelled"
    assert _sub(db, target.id).cancelled_at == frozen_clock()
    assert has_active_membership(db, target.id, frozen_clock()) is False


def test_cancel_without_active_membership_returns_409(client, db):
    admin, target = create_admin(db), _target(db)

    response = _cancel(client, admin, target.id)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "no_active_membership"


def test_invalid_reason_or_days_return_422(client, db):
    admin, target = create_admin(db), _target(db)
    create_plan(db)

    assert _grant(client, admin, target.id, reason="").status_code == 422
    assert _grant(client, admin, target.id, reason="ab").status_code == 422
    assert _grant(client, admin, target.id, days=0).status_code == 422
    assert _grant(client, admin, target.id, days=3651).status_code == 422
    extra = client.post(
        _url(target.id, "/grant"), json={"days": 5, "reason": "Cortesía", "role": "admin"}, headers=admin.headers
    )
    assert extra.status_code == 422
    assert _cancel(client, admin, target.id, reason="").status_code == 422


def test_customer_gets_403_on_all_three_endpoints(client, db):
    customer, target = new_user(), _target(db)
    create_plan(db)

    assert client.get(_url(target.id), headers=customer.headers).status_code == 403
    assert _grant(client, customer, target.id).status_code == 403
    assert _cancel(client, customer, target.id).status_code == 403


def test_unknown_user_returns_404(client, db):
    admin = create_admin(db)
    create_plan(db)
    missing = uuid.uuid4()

    assert client.get(_url(missing), headers=admin.headers).status_code == 404
    assert _grant(client, admin, missing).status_code == 404
    assert _cancel(client, admin, missing).status_code == 404


def test_get_membership_without_row_is_none(client, db):
    admin, target = create_admin(db), _target(db)

    body = client.get(_url(target.id), headers=admin.headers).json()

    assert body["status"] == "none" and body["is_active"] is False and body["ends_at"] is None


def test_get_membership_reports_expired_after_end_date(client, db, frozen_clock):
    admin, target = create_admin(db), _target(db)
    create_plan(db)
    _grant(client, admin, target.id, days=30)
    frozen_clock.advance(days=31)

    body = client.get(_url(target.id), headers=admin.headers).json()

    assert body["status"] == "expired" and body["is_active"] is False


def test_audit_records_days_reason_and_end_date(client, db, frozen_clock):
    admin, target = create_admin(db), _target(db)
    create_plan(db)

    _grant(client, admin, target.id, days=90, reason="Pago en efectivo")

    db.expire_all()
    log = db.scalars(select(AdminAuditLog).where(AdminAuditLog.action == "membership.grant")).one()
    assert log.entity_type == "subscription" and log.entity_id == str(_sub(db, target.id).id)
    assert log.details["days"] == 90 and log.details["reason"] == "Pago en efectivo"
    assert log.details["ends_at"] == (frozen_clock() + timedelta(days=90)).isoformat()


def test_profiles_list_includes_plus_status_and_end_date(client, db, frozen_clock):
    admin = create_admin(db)
    create_plan(db)
    active, expired, cancelled, plain = _target(db), _target(db), _target(db), _target(db)
    _grant(client, admin, expired.id, days=10)
    frozen_clock.advance(days=20)
    _grant(client, admin, active.id, days=30)
    _grant(client, admin, cancelled.id, days=30)
    _cancel(client, admin, cancelled.id)

    rows = {p["id"]: p for p in client.get("/api/v1/admin/profiles", headers=admin.headers).json()}

    assert rows[str(active.id)]["plus_status"] == "active"
    assert rows[str(active.id)]["plus_ends_at"] is not None
    assert rows[str(expired.id)]["plus_status"] == "expired"
    assert rows[str(cancelled.id)]["plus_status"] == "cancelled"
    assert rows[str(plain.id)]["plus_status"] == "none" and rows[str(plain.id)]["plus_ends_at"] is None
