"""Planes creados por el admin: código automático, nombres únicos y sin planes preinstalados."""

import importlib.util
from pathlib import Path

import pytest

from app.core.database import engine
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


def test_code_is_always_generated_and_a_deleted_plan_with_history_keeps_its_code_taken(client, db):
    # Arrange: el primer plan tiene historial, así que al eliminarlo solo se oculta y su código sigue ocupado.
    admin = create_admin(db)
    first = _create(client, admin, name="S2 Box Mamá & Hija", price=60_000).json()
    assert _request(client, new_user(), plan_code=first["code"]).status_code == 201
    assert client.delete(f"{ADMIN}/plans/{first['id']}", headers=admin.headers).status_code == 204

    # Act
    second = _create(client, admin, name="S2 Box Mamá & Hija")

    # Assert
    assert first["code"] == "s2-box-mama-hija"
    assert second.status_code == 201 and second.json()["code"] == "s2-box-mama-hija-2"


def test_code_sent_by_an_old_client_is_ignored_on_create_and_edit(client, db):
    # Arrange
    admin = create_admin(db)

    # Act
    created = _create(client, admin, name="Plan Uno", code="mi-codigo")
    edited = client.patch(f"{ADMIN}/plans/{created.json()['id']}", json={"code": "otro-codigo", "price": 50_000}, headers=admin.headers)
    bad_format = _create(client, admin, name="Plan Dos", code="Mi Plan")

    # Assert
    assert created.status_code == 201 and created.json()["code"] == "plan-uno"
    assert edited.status_code == 200 and edited.json()["code"] == "plan-uno" and edited.json()["price"] == 50_000
    assert bad_format.status_code == 201 and bad_format.json()["code"] == "plan-dos"


def test_renaming_a_plan_without_history_regenerates_its_code_and_audits_it(client, db):
    # Arrange
    admin = create_admin(db)
    plan = _create(client, admin, name="Plus Anual").json()

    # Act
    response = client.patch(f"{ADMIN}/plans/{plan['id']}", json={"name": "S2 Box Anual"}, headers=admin.headers)

    # Assert
    assert response.status_code == 200 and response.json()["code"] == "s2-box-anual"
    log = db.query(AdminAuditLog).filter_by(action="plan.update").one()
    assert log.details["code"] == {"from": "plus-anual", "to": "s2-box-anual"}
    assert log.details["after"]["code"] == "s2-box-anual"


def test_renaming_keeps_the_code_when_the_slug_is_the_same_or_the_plan_has_history(client, db):
    # Arrange
    admin = create_admin(db)
    same = _create(client, admin, name="Plan Uno").json()
    plan = create_plan(db, price=60_000)
    _request(client, new_user())
    db.query(AdminAuditLog).delete()
    db.commit()

    # Act
    case_only = client.patch(f"{ADMIN}/plans/{same['id']}", json={"name": "plan uno"}, headers=admin.headers)
    with_history = client.patch(f"{ADMIN}/plans/{plan.id}", json={"name": "Nuevo nombre"}, headers=admin.headers)

    # Assert
    assert case_only.json()["code"] == "plan-uno"
    assert with_history.status_code == 200 and with_history.json()["name"] == "Nuevo nombre"
    assert with_history.json()["code"] == "plus-mensual"
    assert all("code" not in log.details for log in db.query(AdminAuditLog).filter_by(action="plan.update"))


def test_regenerated_code_counts_archived_plans_as_taken(client, db):
    # Arrange
    admin = create_admin(db)
    old = _create(client, admin, name="S2 Box Anual").json()
    client.post(f"{ADMIN}/plans/{old['id']}/archive", headers=admin.headers)
    other = _create(client, admin, name="Otro").json()

    # Act
    renamed = client.patch(f"{ADMIN}/plans/{other['id']}", json={"name": "S2 box anual!"}, headers=admin.headers)

    # Assert
    assert renamed.status_code == 200 and renamed.json()["code"] == "s2-box-anual-2"


def test_new_plan_code_works_for_subscription_requests(client, db):
    # Arrange
    admin, user = create_admin(db), new_user()
    plan = _create(client, admin, name="S2 Box Anual", price=600_000).json()

    # Act
    response = _request(client, user, plan_code=plan["code"])

    # Assert
    assert plan["code"] == "s2-box-anual"
    assert response.status_code == 201


def _load_migration():
    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0013_codigos_de_plan_automaticos.py"
    spec = importlib.util.spec_from_file_location("migration_0013", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _named_plan(db, name: str, code: str) -> Plan:
    plan = create_plan(db, code=code, price=60_000)
    plan.name = name
    db.commit()
    return plan


def test_migration_0013_fixes_old_codes_of_plans_without_history_only(client, db):
    # Arrange: un plan sin historial con código viejo, otro con historial y un tercero que ya está bien.
    old = _named_plan(db, "S2 Box Anual", "plus-anual")
    _named_plan(db, "S2 Box Mensual", "plus-mensual")
    _named_plan(db, "S2 Box Trimestral", "s2-box-trimestral")
    assert _request(client, new_user(), plan_code="plus-mensual").status_code == 201

    # Act
    with engine.begin() as conn:
        changed = _load_migration().regenerate_codes(conn)

    # Assert
    db.expire_all()
    codes = {p.name: p.code for p in db.query(Plan)}
    assert codes == {"S2 Box Anual": "s2-box-anual", "S2 Box Mensual": "plus-mensual", "S2 Box Trimestral": "s2-box-trimestral"}
    assert changed == {old.id: ("plus-anual", "s2-box-anual")}


def test_migration_0013_resolves_collisions_between_plans_with_the_same_slug(db):
    # Arrange
    _named_plan(db, "S2 Box", "viejo-uno")
    _named_plan(db, "s2 box!", "viejo-dos")

    # Act
    with engine.begin() as conn:
        _load_migration().regenerate_codes(conn)

    # Assert
    db.expire_all()
    assert sorted(p.code for p in db.query(Plan)) == ["s2-box", "s2-box-2"]


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
