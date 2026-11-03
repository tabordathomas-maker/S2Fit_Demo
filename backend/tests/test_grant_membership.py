from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.errors import AppError
from app.models import AdminAuditLog, Profile, Subscription
from app.models.enums import SubscriptionStatus
from app.services.subscriptions import has_active_membership
from scripts.grant_membership import grant_membership
from tests.factories import create_plan, new_user


def _profile(db):
    user = new_user()
    db.add(Profile(id=user.id, email=user.email))
    db.commit()
    return user


def _sub(db, user):
    db.expire_all()
    return db.scalars(select(Subscription).where(Subscription.user_id == user.id)).one()


def test_grants_membership_to_user_without_one(db, frozen_clock):
    create_plan(db)
    user = _profile(db)

    message = grant_membership(db, user.email.upper(), days=30, reason="Cortesía")

    sub = _sub(db, user)
    assert has_active_membership(db, user.id, frozen_clock()) is True
    assert sub.ends_at == frozen_clock() + timedelta(days=30)
    assert sub.last_payment_reference == "MANUAL-ADMIN"
    assert "2026-04-01" in message and "Cortesía" in message


def test_extends_an_active_membership_from_its_end_date(db, frozen_clock):
    create_plan(db)
    user = _profile(db)
    grant_membership(db, user.email, days=30, reason="Cortesía")

    grant_membership(db, user.email, days=10, reason="Cortesía")

    assert _sub(db, user).ends_at == frozen_clock() + timedelta(days=40)


def test_reactivates_an_expired_membership_from_now(db, frozen_clock):
    create_plan(db)
    user = _profile(db)
    grant_membership(db, user.email, days=30, reason="Cortesía")
    frozen_clock.advance(days=45)

    grant_membership(db, user.email, days=15, reason="Cortesía")

    sub = _sub(db, user)
    assert sub.status == SubscriptionStatus.active
    assert sub.ends_at == frozen_clock() + timedelta(days=15)
    assert has_active_membership(db, user.id, frozen_clock()) is True


def test_cancel_revokes_access(db, frozen_clock):
    create_plan(db)
    user = _profile(db)
    grant_membership(db, user.email, days=30, reason="Cortesía")

    grant_membership(db, user.email, cancel=True, reason="Fin de prueba")

    assert _sub(db, user).cancelled_at == frozen_clock()
    assert has_active_membership(db, user.id, frozen_clock()) is False


def test_fails_without_an_active_plan(db):
    user = _profile(db)
    with pytest.raises(AppError) as exc:
        grant_membership(db, user.email, reason="Cortesía")
    assert exc.value.code == "plans_missing"


def test_fails_when_email_does_not_exist(db):
    create_plan(db)
    with pytest.raises(LookupError, match="No existe ninguna cuenta"):
        grant_membership(db, "nadie@example.com", reason="Cortesía")


def test_script_does_not_write_audit_log(db):
    create_plan(db)
    user = _profile(db)

    grant_membership(db, user.email, days=5, reason="Cortesía")

    assert db.scalars(select(AdminAuditLog)).all() == []
