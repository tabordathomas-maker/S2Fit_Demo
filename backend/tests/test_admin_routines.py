"""CRUD de rutinas personalizadas desde el panel: editar, reasignar, archivar y eliminar."""

import uuid

from app.models import AdminAuditLog, CustomRoutine, RoutineStep
from tests.factories import create_admin, new_user
from tests.test_routines import API, _complete, _customer, _routine, _step_ids

ADMIN = f"{API}/admin"


def test_patch_routine_updates_only_sent_fields_and_audits(client, db):
    # Arrange
    admin, user = create_admin(db), _customer(db)
    rid = _routine(client, admin, user, activate=False)

    # Act
    response = client.patch(f"{ADMIN}/routines/{rid}", json={"goal": "Fuerza", "description": "Semana 1"}, headers=admin.headers)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["goal"] == "Fuerza" and body["description"] == "Semana 1" and body["title"] == "Piernas"
    log = db.query(AdminAuditLog).filter_by(action="routine.update").one()
    assert log.entity_id == str(rid) and log.details["changed_fields"] == ["description", "goal"]


def test_patch_routine_rejects_extra_and_invalid_fields(client, db):
    # Arrange
    admin, user = create_admin(db), _customer(db)
    rid = _routine(client, admin, user, activate=False)
    url = f"{ADMIN}/routines/{rid}"

    # Act / Assert
    assert client.patch(url, json={"created_by": str(admin.id)}, headers=admin.headers).status_code == 422
    assert client.patch(url, json={"title": "x"}, headers=admin.headers).status_code == 422
    assert client.patch(url, json={"status": "otro"}, headers=admin.headers).status_code == 422


def test_reassign_routine_without_progress_changes_owner_and_audits(client, db):
    # Arrange
    admin, first, second = create_admin(db), _customer(db), _customer(db)
    rid = _routine(client, admin, first, activate=False)

    # Act
    response = client.patch(f"{ADMIN}/routines/{rid}", json={"user_id": str(second.id)}, headers=admin.headers)
    missing = client.patch(f"{ADMIN}/routines/{rid}", json={"user_id": str(uuid.uuid4())}, headers=admin.headers)

    # Assert
    assert response.status_code == 200 and response.json()["user_id"] == str(second.id)
    assert missing.status_code == 404
    log = db.query(AdminAuditLog).filter_by(action="routine.reassign").one()
    assert log.details == {"from": str(first.id), "to": str(second.id)}


def test_reassign_routine_with_progress_is_blocked(client, db):
    # Arrange
    admin, first, second = create_admin(db), _customer(db), _customer(db)
    rid = _routine(client, admin, first, steps=2)
    assert _complete(client, first, rid, _step_ids(client, admin, rid)[0]).status_code in (200, 201)

    # Act
    response = client.patch(f"{ADMIN}/routines/{rid}", json={"user_id": str(second.id)}, headers=admin.headers)

    # Assert
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "RESOURCE_IN_USE" and response.json()["error"]["details"] == {"completions": 1}


def test_delete_routine_without_progress_removes_steps_too(client, db):
    # Arrange
    admin, user = create_admin(db), _customer(db)
    rid = _routine(client, admin, user, steps=3)

    # Act
    response = client.delete(f"{ADMIN}/routines/{rid}", headers=admin.headers)

    # Assert
    assert response.status_code == 204
    db.expire_all()
    assert db.get(CustomRoutine, rid) is None
    assert db.query(RoutineStep).filter_by(routine_id=rid).count() == 0
    assert db.query(AdminAuditLog).filter_by(action="routine.delete", entity_id=str(rid)).count() == 1
    assert client.get(f"{ADMIN}/routines/{rid}", headers=admin.headers).status_code == 404


def test_delete_routine_with_progress_returns_409_with_counts(client, db):
    # Arrange
    admin, user = create_admin(db), _customer(db)
    rid = _routine(client, admin, user, steps=2)
    _complete(client, user, rid, _step_ids(client, admin, rid)[0])

    # Act
    response = client.delete(f"{ADMIN}/routines/{rid}", headers=admin.headers)

    # Assert
    error = response.json()["error"]
    assert response.status_code == 409 and error["code"] == "RESOURCE_IN_USE"
    assert error["details"] == {"completions": 1} and "archivarla" in error["message"]
    assert db.get(CustomRoutine, rid) is not None


def test_archive_and_restore_with_default_listing_filter(client, db):
    # Arrange
    admin, user = create_admin(db), _customer(db)
    rid = _routine(client, admin, user, steps=2)
    ids = lambda **params: [r["id"] for r in client.get(f"{ADMIN}/routines", params=params, headers=admin.headers).json()]  # noqa: E731

    # Act
    archived = client.post(f"{ADMIN}/routines/{rid}/archive", headers=admin.headers)
    default_list, with_archived = ids(), ids(include_archived="true")
    restored = client.post(f"{ADMIN}/routines/{rid}/restore", headers=admin.headers)

    # Assert
    assert archived.json()["status"] == "archived"
    assert rid not in default_list and rid in with_archived
    assert restored.json()["status"] == "active" and rid in ids()
    assert {log.action for log in db.query(AdminAuditLog).all()} >= {"routine.archive", "routine.restore"}


def test_step_edit_delete_and_reorder_keep_positions(client, db):
    # Arrange
    admin, user = create_admin(db), _customer(db)
    rid = _routine(client, admin, user, steps=3, activate=False)
    first, second, third = _step_ids(client, admin, rid)

    # Act
    edited = client.patch(f"{ADMIN}/routine-steps/{first}", json={"title": "Sentadillas"}, headers=admin.headers)
    reordered = client.put(f"{ADMIN}/routines/{rid}/steps/order", json={"step_ids": [third, first, second]}, headers=admin.headers)
    removed = client.delete(f"{ADMIN}/routine-steps/{first}", headers=admin.headers)

    # Assert
    assert edited.status_code == 200
    assert [s["id"] for s in reordered.json()["steps"]] == [third, first, second]
    assert [(s["id"], s["position"]) for s in removed.json()["steps"]] == [(third, 1), (second, 2)]


def test_routine_routes_404_401_403(client, db):
    # Arrange
    admin, customer = create_admin(db), new_user()

    # Act / Assert
    for method, suffix in [("delete", ""), ("post", "/archive"), ("post", "/restore")]:
        call = getattr(client, method)
        path = f"{ADMIN}/routines/9999{suffix}"
        assert call(path, headers=admin.headers).status_code == 404, path
        assert call(path).status_code == 401, path
        assert call(path, headers=customer.headers).status_code == 403, path
    assert client.patch(f"{ADMIN}/routines/9999", json={"goal": "x"}, headers=admin.headers).status_code == 404
    assert client.patch(f"{ADMIN}/routines/9999", json={}).status_code == 401
    assert client.patch(f"{ADMIN}/routines/9999", json={}, headers=customer.headers).status_code == 403
