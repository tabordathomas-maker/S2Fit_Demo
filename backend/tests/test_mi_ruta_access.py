"""Acceso a Mi Ruta: códigos del admin, bloqueo en el backend, canje y habilitación por compra."""

import importlib.util
import uuid
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core import clock
from app.core.references import ALPHABET
from app.main import app
from app.models import AccessCode, AdminAuditLog, Profile
from app.services import mi_ruta_access
from tests.factories import (
    activate_membership, create_admin, create_plan, create_variant, new_user, payment_for, place_order,
)

API = "/api/v1"
MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0011_acceso_mi_ruta.py"
# (ruta, estado sin cuenta ni código): lo que exige cuenta responde 401 antes que 403.
GATED = [
    (f"{API}/content", 403),
    (f"{API}/content/1", 403),
    (f"{API}/challenges", 403),
    (f"{API}/rewards", 401),
    (f"{API}/habits", 401),
    (f"{API}/routines", 401),
]


def _code(db, *, active=True, expires_at=None, value: str | None = None) -> AccessCode:
    code = AccessCode(code=value or "".join(ALPHABET[i] for i in range(6)), is_active=active, expires_at=expires_at)
    db.add(code)
    db.commit()
    db.refresh(code)
    return code


def _profile(client, user) -> None:
    """Crea el perfil con la primera llamada autenticada."""
    assert client.get(f"{API}/me", headers=user.headers).status_code == 200


def _confirm_body(reference: str, amount: int, ext: str | None = None) -> dict:
    return {"operation_reference": reference, "amount": amount, "method": "transfer",
            "external_reference": ext or f"BANCO-{uuid.uuid4().hex[:8]}"}


def _confirm_order(client, db, user, admin):
    variant = create_variant(db, stock=3, price=135_000)
    order = place_order(client, user, variant.id).json()
    payment = payment_for(client, admin, order["reference"])
    response = client.post(f"{API}/admin/payments/{payment['id']}/confirm",
                           json=_confirm_body(order["reference"], order["total"]), headers=admin.headers)
    assert response.status_code == 200, response.text


def _profile_of(db, user) -> Profile:
    db.expire_all()
    return db.get(Profile, user.id)


# --- Generación (admin) -----------------------------------------------------------------------

def test_admin_generates_n_unique_codes_with_allowed_alphabet(locked_client, db):
    # Arrange
    admin = create_admin(db)

    # Act
    response = locked_client.post(f"{API}/admin/access-codes", headers=admin.headers,
                                  json={"quantity": 50, "note": "Feria Medellín", "phone": "300 123 4567"})

    # Assert
    assert response.status_code == 201
    codes = response.json()
    assert len(codes) == 50
    values = [c["code"] for c in codes]
    assert len(set(values)) == 50
    assert all(len(v) == 6 and set(v) <= set(ALPHABET) for v in values)
    assert codes[0]["note"] == "Feria Medellín" and codes[0]["phone"] == "3001234567"
    assert codes[0]["status"] == "active" and codes[0]["used_count"] == 0
    log = db.scalars(select(AdminAuditLog).where(AdminAuditLog.action == "access_code.create")).all()
    assert len(log) == 50 and all(entry.entity_id.isdigit() and entry.details == {} for entry in log)


def test_generation_rejects_more_than_50_and_unknown_fields(locked_client, db):
    admin = create_admin(db)
    assert locked_client.post(f"{API}/admin/access-codes", headers=admin.headers, json={"quantity": 51}).status_code == 422
    assert locked_client.post(f"{API}/admin/access-codes", headers=admin.headers, json={"quantity": 1, "role": "admin"}).status_code == 422


def test_customer_cannot_manage_codes(locked_client, db):
    # Arrange
    customer = new_user()
    _profile(locked_client, customer)

    # Act / Assert
    assert locked_client.post(f"{API}/admin/access-codes", headers=customer.headers, json={"quantity": 1}).status_code == 403
    assert locked_client.get(f"{API}/admin/access-codes", headers=customer.headers).status_code == 403
    assert locked_client.get(f"{API}/admin/access-codes").status_code == 401


def test_admin_lists_filters_updates_and_deletes_codes(locked_client, db, frozen_clock):
    # Arrange
    admin = create_admin(db)
    fresh = _code(db, value="AAAAAA")
    expired = _code(db, value="BBBBBB", expires_at=clock.now() - timedelta(days=1))
    off = _code(db, value="CCCCCC", active=False)
    fresh.note = "Cliente Laura"
    db.commit()

    # Act
    by_status = {s: [c["code"] for c in locked_client.get(f"{API}/admin/access-codes", params={"status": s}, headers=admin.headers).json()]
                 for s in ("active", "inactive", "expired")}
    by_note = locked_client.get(f"{API}/admin/access-codes", params={"q": "laura"}, headers=admin.headers).json()
    by_code = locked_client.get(f"{API}/admin/access-codes", params={"q": "bbb"}, headers=admin.headers).json()
    toggled = locked_client.patch(f"{API}/admin/access-codes/{off.id}", json={"is_active": True}, headers=admin.headers)
    removed = locked_client.delete(f"{API}/admin/access-codes/{expired.id}", headers=admin.headers)

    # Assert
    assert by_status == {"active": ["AAAAAA"], "inactive": ["CCCCCC"], "expired": ["BBBBBB"]}
    assert [c["code"] for c in by_note] == ["AAAAAA"] and [c["code"] for c in by_code] == ["BBBBBB"]
    assert toggled.status_code == 200 and toggled.json()["status"] == "active"
    assert removed.status_code == 204 and db.get(AccessCode, expired.id) is None
    actions = {a for (a,) in db.execute(select(AdminAuditLog.action))}
    assert {"access_code.activate", "access_code.delete"} <= actions


def test_used_code_can_only_be_deactivated_not_deleted(locked_client, db):
    # Arrange
    admin = create_admin(db)
    code = _code(db, value="DDDDDD")
    assert locked_client.post(f"{API}/mi-ruta/codes/verify", json={"code": "dddddd"}).status_code == 200

    # Act
    blocked = locked_client.delete(f"{API}/admin/access-codes/{code.id}", headers=admin.headers)
    deactivated = locked_client.patch(f"{API}/admin/access-codes/{code.id}", json={"is_active": False}, headers=admin.headers)

    # Assert
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "RESOURCE_IN_USE"
    assert deactivated.json()["status"] == "inactive" and deactivated.json()["used_count"] == 1


# --- Verificación -----------------------------------------------------------------------------

@pytest.mark.parametrize("typed", ["K7M2QX", "k7m2qx", " k7m-2qx ", "K7M 2QX"])
def test_verify_normalizes_case_spaces_and_hyphens(locked_client, db, frozen_clock, typed):
    # Arrange
    code = _code(db, value="K7M2QX")

    # Act
    response = locked_client.post(f"{API}/mi-ruta/codes/verify", json={"code": typed})

    # Assert
    assert response.status_code == 200
    db.expire_all()
    stored = db.get(AccessCode, code.id)
    assert stored.used_count == 1 and stored.last_used_at == clock.now()


def test_verify_gives_the_same_error_for_unknown_inactive_and_expired(locked_client, db, frozen_clock):
    # Arrange
    _code(db, value="OFFOFF", active=False)
    _code(db, value="OLDOLD", expires_at=clock.now() - timedelta(seconds=1))

    # Act
    responses = [locked_client.post(f"{API}/mi-ruta/codes/verify", json={"code": c}) for c in ("ZZZZZZ", "OFFOFF", "OLDOLD", "xx")]

    # Assert
    assert {r.status_code for r in responses} == {400}
    assert len({r.text for r in responses}) == 1
    assert responses[0].json()["error"]["message"] == "Código no válido o vencido"


def test_verify_is_rate_limited_per_ip(locked_client, db):
    # Arrange / Act
    statuses = [locked_client.post(f"{API}/mi-ruta/codes/verify", json={"code": "ZZZZZZ"}, headers={"X-Forwarded-For": "203.0.113.7, 10.0.0.1"}).status_code
                for _ in range(12)]
    other_ip = locked_client.post(f"{API}/mi-ruta/codes/verify", json={"code": "ZZZZZZ"}, headers={"X-Forwarded-For": "203.0.113.8"})

    # Assert
    assert statuses[:10] == [400] * 10
    assert statuses[10:] == [429, 429]
    assert other_ip.status_code == 400


# --- Bloqueo de los endpoints de Mi Ruta -------------------------------------------------------

@pytest.mark.parametrize("path,expected", GATED)
def test_anonymous_without_code_is_locked(locked_client, path, expected):
    response = locked_client.get(path)
    assert response.status_code == expected
    if expected == 403:
        assert response.json()["error"]["code"] == "mi_ruta_locked"


def test_anonymous_with_valid_header_code_sees_content_but_not_the_account_panel(locked_client, db):
    # Arrange
    _code(db, value="K7M2QX")
    headers = {"X-MiRuta-Code": "k7m-2qx"}

    # Act
    content = locked_client.get(f"{API}/content", headers=headers)
    challenges = locked_client.get(f"{API}/challenges", headers=headers)
    habits = locked_client.get(f"{API}/habits", headers=headers)
    bad = locked_client.get(f"{API}/content", headers={"X-MiRuta-Code": "ZZZZZZ"})

    # Assert
    assert content.status_code == 200 and challenges.status_code == 200
    assert habits.status_code == 401  # hábitos, retos con progreso y recompensas siguen pidiendo cuenta
    assert bad.status_code == 403 and bad.json()["error"]["code"] == "mi_ruta_locked"


def test_header_with_inactive_or_expired_code_is_locked(locked_client, db, frozen_clock):
    _code(db, value="OFFOFF", active=False)
    _code(db, value="OLDOLD", expires_at=clock.now() - timedelta(days=1))
    for value in ("OFFOFF", "OLDOLD"):
        assert locked_client.get(f"{API}/content", headers={"X-MiRuta-Code": value}).status_code == 403


def test_user_without_purchase_is_locked_and_with_confirmed_order_is_unlocked(locked_client, db, frozen_clock):
    # Arrange
    admin, user = create_admin(db), new_user()
    _profile(locked_client, user)
    before = locked_client.get(f"{API}/habits", headers=user.headers)
    assert before.status_code == 403 and before.json()["error"]["code"] == "mi_ruta_locked"
    assert locked_client.get(f"{API}/mi-ruta/access", headers=user.headers).json() == {"has_access": False, "source": None}

    # Act
    _confirm_order(locked_client, db, user, admin)

    # Assert
    assert locked_client.get(f"{API}/habits", headers=user.headers).status_code == 200
    assert locked_client.get(f"{API}/mi-ruta/access", headers=user.headers).json() == {"has_access": True, "source": "order"}
    profile = _profile_of(db, user)
    assert profile.mi_ruta_unlocked_at == clock.now() and profile.mi_ruta_unlock_source == "order"


def test_second_order_does_not_move_the_unlock_date(locked_client, db, frozen_clock):
    # Arrange
    admin, user = create_admin(db), new_user()
    _profile(locked_client, user)
    _confirm_order(locked_client, db, user, admin)
    first = _profile_of(db, user).mi_ruta_unlocked_at
    frozen_clock.advance(days=3)

    # Act
    _confirm_order(locked_client, db, user, admin)

    # Assert
    assert _profile_of(db, user).mi_ruta_unlocked_at == first


def test_confirming_a_subscription_does_not_unlock_mi_ruta_on_the_account(locked_client, db, frozen_clock):
    # Arrange
    admin, user = create_admin(db), new_user()
    create_plan(db, price=60_000)
    request = locked_client.post(f"{API}/subscriptions/requests", json={"plan_code": "plus-mensual"}, headers=user.headers).json()
    locked_client.post(f"{API}/admin/subscription-requests/{request['id']}/terms",
                       json={"agreed_price": 60_000, "agreed_duration_days": 30}, headers=admin.headers)
    pending = locked_client.get(f"{API}/admin/subscription-requests", headers=admin.headers).json()
    payment_id = next(r["payment_id"] for r in pending if r["id"] == request["id"])

    # Act
    confirmed = locked_client.post(f"{API}/admin/payments/{payment_id}/confirm",
                                   json=_confirm_body(request["reference"], 60_000), headers=admin.headers)

    # Assert
    assert confirmed.status_code == 200
    profile = _profile_of(db, user)
    assert profile.mi_ruta_unlocked_at is None and profile.mi_ruta_unlock_source is None
    notices = locked_client.get(f"{API}/notifications", headers=user.headers).json()["items"]
    assert not [i for i in notices if i["kind"] == "mi_ruta"]


def test_active_membership_and_admin_have_access(locked_client, db):
    # Arrange
    member, admin = new_user(), create_admin(db)
    activate_membership(locked_client, db, member)

    # Act / Assert
    assert locked_client.get(f"{API}/habits", headers=member.headers).status_code == 200
    assert locked_client.get(f"{API}/mi-ruta/access", headers=member.headers).json()["source"] == "membership"
    assert locked_client.get(f"{API}/habits", headers=admin.headers).status_code == 200
    assert locked_client.get(f"{API}/mi-ruta/access", headers=admin.headers).json()["source"] == "admin"


def test_admin_can_enable_and_remove_mi_ruta_by_hand(locked_client, db, frozen_clock):
    # Arrange
    admin, user = create_admin(db), new_user()
    _profile(locked_client, user)

    # Act
    enabled = locked_client.post(f"{API}/admin/users/{user.id}/mi-ruta", json={"enabled": True}, headers=admin.headers)
    allowed = locked_client.get(f"{API}/habits", headers=user.headers).status_code
    removed = locked_client.post(f"{API}/admin/users/{user.id}/mi-ruta", json={"enabled": False}, headers=admin.headers)
    blocked = locked_client.get(f"{API}/habits", headers=user.headers).status_code

    # Assert
    assert enabled.status_code == 200 and enabled.json()["mi_ruta_unlock_source"] == "admin"
    assert removed.json()["mi_ruta_unlocked_at"] is None
    assert (allowed, blocked) == (200, 403)
    assert locked_client.post(f"{API}/admin/users/{user.id}/mi-ruta", json={"enabled": True}, headers=user.headers).status_code == 403


# --- Canje ------------------------------------------------------------------------------------

def test_redeem_links_the_code_and_unlocks_the_account(locked_client, db, frozen_clock):
    # Arrange
    code = _code(db, value="K7M2QX")
    user = new_user()
    _profile(locked_client, user)

    # Act
    response = locked_client.post(f"{API}/mi-ruta/codes/redeem", json={"code": "k7m-2qx"}, headers=user.headers)

    # Assert
    assert response.status_code == 200 and response.json() == {"has_access": True, "source": "code"}
    profile = _profile_of(db, user)
    assert profile.mi_ruta_code_id == code.id and profile.mi_ruta_unlock_source == "code"
    assert locked_client.get(f"{API}/habits", headers=user.headers).status_code == 200
    listing = locked_client.get(f"{API}/admin/access-codes", headers=create_admin(db).headers).json()
    assert listing[0]["linked_email"] == user.email and listing[0]["used_count"] == 1


def test_redeeming_twice_with_the_same_account_is_idempotent(locked_client, db):
    # Arrange
    code = _code(db, value="K7M2QX")
    user = new_user()
    _profile(locked_client, user)
    first = locked_client.post(f"{API}/mi-ruta/codes/redeem", json={"code": "K7M2QX"}, headers=user.headers)

    # Act
    second = locked_client.post(f"{API}/mi-ruta/codes/redeem", json={"code": "K7M2QX"}, headers=user.headers)

    # Assert
    assert first.status_code == second.status_code == 200
    db.expire_all()
    assert db.get(AccessCode, code.id).used_count == 1


def test_another_account_cannot_redeem_a_linked_code(locked_client, db):
    # Arrange
    _code(db, value="K7M2QX")
    owner, other = new_user(), new_user()
    _profile(locked_client, owner)
    _profile(locked_client, other)
    locked_client.post(f"{API}/mi-ruta/codes/redeem", json={"code": "K7M2QX"}, headers=owner.headers)

    # Act
    response = locked_client.post(f"{API}/mi-ruta/codes/redeem", json={"code": "K7M2QX"}, headers=other.headers)

    # Assert
    assert response.status_code == 409 and response.json()["error"]["code"] == "code_already_linked"
    assert _profile_of(db, other).mi_ruta_unlocked_at is None


def test_redeem_requires_login_and_a_valid_code(locked_client, db):
    user = new_user()
    assert locked_client.post(f"{API}/mi-ruta/codes/redeem", json={"code": "K7M2QX"}).status_code == 401
    invalid = locked_client.post(f"{API}/mi-ruta/codes/redeem", json={"code": "K7M2QX"}, headers=user.headers)
    assert invalid.status_code == 400 and invalid.json()["error"]["code"] == "invalid_code"


# --- Notificación -----------------------------------------------------------------------------

def test_mi_ruta_notification_is_unread_after_confirmation_and_clears_after_seen(locked_client, db, frozen_clock):
    # Arrange
    admin, user = create_admin(db), new_user()
    _profile(locked_client, user)
    frozen_clock.advance(minutes=1)
    _confirm_order(locked_client, db, user, admin)

    # Act
    feed = locked_client.get(f"{API}/notifications", headers=user.headers).json()
    notice = next(i for i in feed["items"] if i["kind"] == "mi_ruta")
    frozen_clock.advance(minutes=1)
    locked_client.post(f"{API}/notifications/seen", headers=user.headers)
    after = locked_client.get(f"{API}/notifications", headers=user.headers).json()

    # Assert
    assert notice["title"] == "Se habilitó tu sección Mi Ruta" and notice["link"] == "/mi-ruta" and notice["unread"] is True
    assert next(i for i in after["items"] if i["kind"] == "mi_ruta")["unread"] is False
    assert after["unread_count"] == 0


# --- Migración, CORS y contrato ----------------------------------------------------------------

def test_user_with_a_previously_paid_order_is_unlocked_by_the_backfill_query(locked_client, db):
    """La consulta del backfill de la migración 0011 habilita a quien ya tenía un pedido pagado, con la fecha más antigua."""
    # Arrange
    admin, user, other = create_admin(db), new_user(), new_user()
    _profile(locked_client, user)
    _profile(locked_client, other)
    _confirm_order(locked_client, db, user, admin)
    _confirm_order(locked_client, db, user, admin)
    from sqlalchemy import text

    from app.core.database import engine
    from app.models import Order

    first_paid = min(o.paid_at for o in db.scalars(select(Order).where(Order.user_id == user.id)))
    with engine.begin() as conn:
        conn.execute(text("UPDATE profiles SET mi_ruta_unlocked_at = NULL, mi_ruta_unlock_source = NULL"))

    # Act
    spec = importlib.util.spec_from_file_location("migration_0011", MIGRATION)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.begin() as conn:
        conn.execute(text(migration.BACKFILL_SQL))

    # Assert
    assert _profile_of(db, user).mi_ruta_unlocked_at == first_paid
    assert _profile_of(db, user).mi_ruta_unlock_source == "order"
    assert _profile_of(db, other).mi_ruta_unlocked_at is None


def test_cors_allows_the_mi_ruta_code_header(locked_client):
    response = locked_client.options(f"{API}/content", headers={
        "Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-miruta-code",
    })
    assert response.status_code == 200
    assert "x-miruta-code" in response.headers["access-control-allow-headers"].lower()


def test_routes_called_by_frontend_exist():
    paths = {(route.path, method) for route in app.routes for method in getattr(route, "methods", ())}
    for expected in [
        (f"{API}/mi-ruta/codes/verify", "POST"), (f"{API}/mi-ruta/access", "GET"), (f"{API}/mi-ruta/codes/redeem", "POST"),
        (f"{API}/admin/access-codes", "GET"), (f"{API}/admin/access-codes", "POST"),
        (f"{API}/admin/access-codes/{{code_id}}", "PATCH"), (f"{API}/admin/access-codes/{{code_id}}", "DELETE"),
        (f"{API}/admin/users/{{user_id}}/mi-ruta", "POST"),
    ]:
        assert expected in paths, expected


def test_service_helpers_normalize_and_check_access(db, frozen_clock):
    assert mi_ruta_access.normalize_code(" k7m-2qx ") == "K7M2QX"
    _code(db, value="K7M2QX")
    assert mi_ruta_access.has_mi_ruta_access(db, None, "k7m 2qx", clock.now()) is True
    assert mi_ruta_access.has_mi_ruta_access(db, None, None, clock.now()) is False
