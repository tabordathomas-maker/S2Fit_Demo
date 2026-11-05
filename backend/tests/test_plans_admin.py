"""Planes creados por el admin: código automático, nombres únicos y sin planes preinstalados."""

import pytest

from app.models import AdminAuditLog, Plan
from app.services.plans import slugify_code, unique_code
from tests.factories import create_admin, create_plan, new_user
from tests.test_subscriptions import _request

ADMIN = "/api/v1/admin"


@pytest.mark.parametrize("name,expected", [
    ("S2 Box Mamá & Hija", "s2-box-mama-hija"),
    ("Plan Básico", "plan-basico"),
    ("🎁✨", "plan"),
    ("&&&", "plan"),
    ("--Ñandú--", "nandu"),
    ("a", "plan"),
])
def test_slugify_code(name, expected):
    assert slugify_code(name) == expected


def test_code_is_trimmed_to_40_without_trailing_dash():
    # Arrange
    name = "Árbol de la vida y de la salud para toda la familia entera " * 2

    # Act
    code = slugify_code(name)

    # Assert
    assert len(code) <= 40 and not code.endswith("-") and code.startswith("arbol-de-la-vida")


def test_unique_code_adds_numeric_suffix_within_40_chars():
    # Arrange
    base = "a" * 40

    # Act / Assert
    assert unique_code("plan", {"plan"}) == "plan-2"
    assert unique_code("plan", {"plan", "plan-2"}) == "plan-3"
    suffixed = unique_code(base, {base})
    assert suffixed == "a" * 38 + "-2" and len(suffixed) == 40


def _create(client, admin, **body):
    return client.post(f"{ADMIN}/plans", json=body, headers=admin.headers)


def test_code_is_generated_and_collisions_get_a_suffix(client, db):
    # Arrange
    admin = create_admin(db)

    # Act
    first = _create(client, admin, name="🎁✨")
    second = _create(client, admin, name="&&&")
    third = _create(client, admin, name="S2 Box Mamá & Hija")

    # Assert
    assert [r.status_code for r in (first, second, third)] == [201, 201, 201]
    assert [r.json()["code"] for r in (first, second, third)] == ["plan", "plan-2", "s2-box-mama-hija"]


def test_name_is_normalized_and_length_is_validated_after_normalizing(client, db):
    # Arrange
    admin = create_admin(db)

    # Act
    ok = _create(client, admin, name="  S2   Box  Anual ")
    one_char = _create(client, admin, name="  a  ")
    too_long = _create(client, admin, name="x" * 81)
    exactly_80 = _create(client, admin, name="y" * 80)

    # Assert
    assert ok.status_code == 201 and ok.json()["name"] == "S2 Box Anual"
    assert one_char.status_code == 422 and too_long.status_code == 422
    assert exactly_80.status_code == 201


def test_duplicate_name_ignoring_case_accents_and_spaces_is_rejected(client, db):
    # Arrange
    admin = create_admin(db)
    assert _create(client, admin, name="S2 Box Mensual").status_code == 201
    assert _create(client, admin, name="Básico").status_code == 201

    # Act
    same_case = _create(client, admin, name="s2 box  mensual")
    same_accent = _create(client, admin, name="Basico")

    # Assert
    assert same_case.status_code == same_accent.status_code == 409
    assert same_case.json()["error"]["code"] == "PLAN_NAME_TAKEN"
    assert same_case.json()["error"]["message"] == "Ya existe un plan llamado «s2 box mensual». Usa otro nombre."


def test_editing_keeps_own_name_but_cannot_take_another_plans_name(client, db):
    # Arrange
    admin = create_admin(db)
    mine = _create(client, admin, name="Plan Uno").json()
    _create(client, admin, name="Plan Dos")

    # Act
    own = client.patch(f"{ADMIN}/plans/{mine['id']}", json={"name": "plan uno", "price": 50_000}, headers=admin.headers)
    clash = client.patch(f"{ADMIN}/plans/{mine['id']}", json={"name": "PLAN   DOS"}, headers=admin.headers)

    # Assert
    assert own.status_code == 200 and own.json()["name"] == "plan uno" and own.json()["price"] == 50_000
    assert clash.status_code == 409 and clash.json()["error"]["code"] == "PLAN_NAME_TAKEN"


def test_deleted_plan_does_not_block_reusing_its_name(client, db):
    # Arrange
    admin = create_admin(db)
    plan = create_plan(db)
    db.query(Plan).update({"name": "S2 Box Viejo", "deleted_at": __import__("app.core.clock", fromlist=["now"]).now(), "is_active": False})
    db.commit()

    # Act
    response = _create(client, admin, name="s2 box viejo")

    # Assert
    assert plan.id is not None and response.status_code == 201


def test_explicit_code_duplicate_and_invalid(client, db):
    # Arrange
    admin = create_admin(db)
    assert _create(client, admin, name="Uno", code="mi-plan").status_code == 201

    # Act
    duplicate = _create(client, admin, name="Dos", code="mi-plan")
    invalid = _create(client, admin, name="Tres", code="Mi Plan")

    # Assert
    assert duplicate.status_code == 409 and duplicate.json()["error"]["code"] == "PLAN_CODE_TAKEN"
    assert invalid.status_code == 422


def test_changing_the_code_is_locked_once_the_plan_has_history(client, db):
    # Arrange
    admin = create_admin(db)
    plan = create_plan(db, price=60_000)
    _request(client, new_user())
    url = f"{ADMIN}/plans/{plan.id}"

    # Act
    locked = client.patch(url, json={"code": "otro-codigo"}, headers=admin.headers)
    other_fields = client.patch(url, json={"name": "Nuevo nombre", "price": 70_000}, headers=admin.headers)
    same_code = client.patch(url, json={"code": plan.code}, headers=admin.headers)

    # Assert
    assert locked.status_code == 409 and locked.json()["error"]["code"] == "PLAN_CODE_LOCKED"
    assert locked.json()["error"]["message"] == "El código no se puede cambiar porque el plan ya tiene historial."
    assert other_fields.status_code == 200 and other_fields.json()["price"] == 70_000
    assert same_code.status_code == 200


def test_code_can_change_while_the_plan_has_no_history(client, db):
    # Arrange
    admin = create_admin(db)
    plan = _create(client, admin, name="Sin historial").json()

    # Act
    response = client.patch(f"{ADMIN}/plans/{plan['id']}", json={"code": "nuevo-codigo"}, headers=admin.headers)

    # Assert
    assert response.status_code == 200 and response.json()["code"] == "nuevo-codigo"


def test_create_validates_fields_and_audits(client, db):
    # Arrange
    admin = create_admin(db)

    # Act
    bad_days = _create(client, admin, name="Plan raro", duration_days=0)
    too_many = _create(client, admin, name="Plan raro", benefits=[f"b{i}" for i in range(13)])
    empty_benefit = _create(client, admin, name="Plan raro", benefits=[""])
    extra = _create(client, admin, name="Plan raro", slug="x")
    ok = _create(client, admin, name="Plan completo", price=150_000, duration_days=90, period_label="trimestral", benefits=["Caja", "Retos"], hide_price=True)

    # Assert
    assert bad_days.status_code == too_many.status_code == empty_benefit.status_code == extra.status_code == 422
    assert ok.status_code == 201 and ok.json()["hide_price"] is True and ok.json()["benefits"] == ["Caja", "Retos"]
    log = db.query(AdminAuditLog).filter_by(action="plan.create").one()
    assert log.entity_id == str(ok.json()["id"]) and log.details["code"] == "plan-completo"


def test_plan_routes_401_403(client, db):
    # Arrange
    customer = new_user()

    # Act / Assert
    assert client.post(f"{ADMIN}/plans", json={"name": "Plan"}).status_code == 401
    assert client.post(f"{ADMIN}/plans", json={"name": "Plan"}, headers=customer.headers).status_code == 403


def test_seed_demo_no_longer_creates_plans(db):
    # Arrange / Act
    import scripts.seed_demo as seed

    # Assert
    assert not hasattr(seed, "PLAN")
    assert db.query(Plan).count() == 0
