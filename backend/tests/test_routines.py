"""Rutinas personalizadas: acceso con S2 Plus, avance, estadísticas y administración."""

from datetime import timedelta

from sqlalchemy import func, select

from app.core import clock
from app.models import Plan, Profile, RoutineStepCompletion, Subscription
from tests.factories import create_admin, create_plan, new_user

API = "/api/v1"


def _customer(db):
    user = new_user()
    db.add(Profile(id=user.id, email=user.email, full_name="Clienta Pruebas"))
    db.commit()
    return user


def _plus(db, user, days=30):
    plan = db.scalars(select(Plan)).first() or create_plan(db)
    now = clock.now()
    db.add(Subscription(user_id=user.id, plan_id=plan.id, status="active", starts_at=now, ends_at=now + timedelta(days=days)))
    db.commit()


def _routine(client, admin, user, *, steps=3, sequential=True, activate=True):
    created = client.post(f"{API}/admin/routines", headers=admin.headers,
                          json={"user_id": str(user.id), "title": "Piernas", "goal": "Tonificar", "sequential": sequential})
    assert created.status_code == 201, created.text
    rid = created.json()["id"]
    for i in range(steps):
        added = client.post(f"{API}/admin/routines/{rid}/steps", headers=admin.headers, json={
            "title": f"Paso {i + 1}", "instructions": "Instrucciones secretas", "media_url": "https://cdn/v.mp4",
            "cover_url": "https://cdn/c.jpg", "duration_minutes": 10, "block_label": "Semana 1",
        })
        assert added.status_code == 201, added.text
    if activate:
        assert client.patch(f"{API}/admin/routines/{rid}", headers=admin.headers, json={"status": "active"}).status_code == 200
    return rid


def _step_ids(client, admin, rid):
    return [s["id"] for s in client.get(f"{API}/admin/routines/{rid}", headers=admin.headers).json()["steps"]]


def _complete(client, user, rid, step_id, body=None):
    return client.post(f"{API}/routines/{rid}/steps/{step_id}/complete", headers=user.headers, json=body or {})


def _states(response):
    return [s["state"] for s in response.json()["steps"]]


# ---- Visibilidad y permisos ----


def test_user_cannot_see_or_complete_other_users_routines_nor_drafts(client, db, frozen_clock):
    admin = create_admin(db)
    owner, other = _customer(db), _customer(db)
    _plus(db, owner)
    _plus(db, other)
    active = _routine(client, admin, owner)
    draft = _routine(client, admin, owner, activate=False)
    step = _step_ids(client, admin, active)[0]

    assert client.get(f"{API}/routines/{active}", headers=other.headers).status_code == 404
    assert _complete(client, other, active, step).status_code == 404
    assert client.get(f"{API}/routines/{draft}", headers=owner.headers).status_code == 404
    assert [r["id"] for r in client.get(f"{API}/routines", headers=owner.headers).json()] == [active]
    assert client.get(f"{API}/routines", headers=other.headers).json() == []


def test_customers_cannot_use_admin_routine_endpoints(client, db):
    customer = _customer(db)
    assert client.get(f"{API}/admin/routines", headers=customer.headers).status_code == 403
    assert client.post(f"{API}/admin/routines", headers=customer.headers,
                       json={"user_id": str(customer.id), "title": "Hola"}).status_code == 403


def test_admin_cannot_create_routine_for_unknown_user(client, db):
    admin = create_admin(db)
    response = client.post(f"{API}/admin/routines", headers=admin.headers,
                           json={"user_id": str(new_user().id), "title": "Fantasma"})
    assert response.status_code == 404


# ---- Mi Ruta es gratis: no se exige membresía ----


def test_user_without_membership_has_full_access_to_their_routine(client, db, frozen_clock):
    # Arrange
    admin = create_admin(db)
    user = _customer(db)
    rid = _routine(client, admin, user)
    step = _step_ids(client, admin, rid)[0]

    # Act
    listing = client.get(f"{API}/routines", headers=user.headers)
    detail = client.get(f"{API}/routines/{rid}", headers=user.headers)
    complete = _complete(client, user, rid, step)
    undo = client.delete(f"{API}/routines/{rid}/steps/{step}/complete", headers=user.headers)

    # Assert
    assert listing.status_code == 200
    item = listing.json()[0]
    assert "locked" not in item and item["title"] == "Piernas" and item["stats"] is not None
    assert detail.status_code == 200 and detail.json()["steps"][0]["instructions"] is not None
    assert complete.status_code == 200 and undo.status_code == 200


def test_membership_expiry_does_not_affect_the_routine(client, db, frozen_clock):
    admin = create_admin(db)
    user = _customer(db)
    _plus(db, user)
    rid = _routine(client, admin, user)
    first = _step_ids(client, admin, rid)[0]
    assert _complete(client, user, rid, first).status_code == 200

    frozen_clock.advance(days=31)
    listing = client.get(f"{API}/routines", headers=user.headers).json()[0]
    detail = client.get(f"{API}/routines/{rid}", headers=user.headers)

    assert listing["progress_pct"] == 33
    assert detail.status_code == 200
    assert detail.json()["stats"]["completed_steps"] == 1
    assert _states(detail) == ["done", "current", "locked"]


# ---- Avance ----


def test_sequential_routine_unlocks_steps_in_order(client, db, frozen_clock):
    admin = create_admin(db)
    user = _customer(db)
    _plus(db, user)
    rid = _routine(client, admin, user)
    one, two, three = _step_ids(client, admin, rid)

    assert _states(client.get(f"{API}/routines/{rid}", headers=user.headers)) == ["current", "locked", "locked"]
    blocked = _complete(client, user, rid, two)
    done = _complete(client, user, rid, one)

    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "step_locked"
    assert _states(done) == ["done", "current", "locked"]
    assert _complete(client, user, rid, three).status_code == 409


def test_non_sequential_routine_allows_any_order(client, db, frozen_clock):
    admin = create_admin(db)
    user = _customer(db)
    _plus(db, user)
    rid = _routine(client, admin, user, sequential=False)
    _, _, three = _step_ids(client, admin, rid)

    response = _complete(client, user, rid, three)

    assert response.status_code == 200
    assert _states(response) == ["available", "available", "done"]


def test_completing_is_idempotent_and_can_be_undone(client, db, frozen_clock):
    admin = create_admin(db)
    user = _customer(db)
    _plus(db, user)
    rid = _routine(client, admin, user)
    one = _step_ids(client, admin, rid)[0]

    _complete(client, user, rid, one, {"minutes": 20, "effort": 3, "note": "Muy bien"})
    again = _complete(client, user, rid, one, {"minutes": 99})
    count = db.scalar(select(func.count()).select_from(RoutineStepCompletion))

    assert again.status_code == 200 and count == 1
    completion = again.json()["steps"][0]["completion"]
    assert (completion["minutes"], completion["effort"], completion["note"]) == (20, 3, "Muy bien")

    undone = client.delete(f"{API}/routines/{rid}/steps/{one}/complete", headers=user.headers)
    assert undone.status_code == 200
    assert _states(undone) == ["current", "locked", "locked"]
    assert undone.json()["stats"]["completed_steps"] == 0


def test_invalid_completion_values_are_rejected(client, db, frozen_clock):
    admin = create_admin(db)
    user = _customer(db)
    _plus(db, user)
    rid = _routine(client, admin, user)
    one = _step_ids(client, admin, rid)[0]

    assert _complete(client, user, rid, one, {"effort": 9}).status_code == 422
    assert _complete(client, user, rid, one, {"minutes": 0}).status_code == 422


def test_archived_routine_is_listed_but_cannot_change(client, db, frozen_clock):
    admin = create_admin(db)
    user = _customer(db)
    _plus(db, user)
    rid = _routine(client, admin, user)
    one = _step_ids(client, admin, rid)[0]
    client.patch(f"{API}/admin/routines/{rid}", headers=admin.headers, json={"status": "archived"})

    listing = client.get(f"{API}/routines", headers=user.headers).json()
    complete = _complete(client, user, rid, one)
    undo = client.delete(f"{API}/routines/{rid}/steps/{one}/complete", headers=user.headers)

    assert [r["status"] for r in listing] == ["archived"]
    assert complete.status_code == 409 and complete.json()["error"]["code"] == "routine_archived"
    assert undo.status_code == 409


# ---- Estadísticas ----


def test_statistics_use_the_local_calendar_and_fall_back_to_planned_minutes(client, db, frozen_clock):
    admin = create_admin(db)
    user = _customer(db)
    _plus(db, user, days=60)
    rid = _routine(client, admin, user)
    one, two, three = _step_ids(client, admin, rid)

    _complete(client, user, rid, one, {"minutes": 25, "effort": 4})  # lunes 2 de marzo
    frozen_clock.advance(days=1)
    _complete(client, user, rid, two, {"effort": 2})  # sin minutos: usa los 10 planeados
    frozen_clock.advance(days=1)  # miércoles, aún sin completar nada hoy

    stats = client.get(f"{API}/routines/{rid}", headers=user.headers).json()["stats"]

    assert stats["progress_pct"] == 67
    assert (stats["completed_steps"], stats["total_steps"]) == (2, 3)
    assert stats["total_minutes"] == 35
    assert stats["avg_effort"] == 3.0
    assert stats["current_streak_days"] == 2
    assert stats["next_step"] == {"id": three, "title": "Paso 3"}
    assert len(stats["weekly"]) == 8
    assert stats["weekly"][0]["week_start"] == "2026-01-12"
    assert stats["weekly"][-1] == {"week_start": "2026-03-02", "completions": 2, "minutes": 35}

    frozen_clock.advance(days=1)  # jueves: ni hoy ni ayer
    assert client.get(f"{API}/routines/{rid}", headers=user.headers).json()["stats"]["current_streak_days"] == 0


# ---- Administración ----


def test_cannot_activate_routine_without_steps(client, db):
    admin = create_admin(db)
    user = _customer(db)
    rid = _routine(client, admin, user, steps=0, activate=False)

    empty = client.patch(f"{API}/admin/routines/{rid}", headers=admin.headers, json={"status": "active"})
    client.post(f"{API}/admin/routines/{rid}/steps", headers=admin.headers, json={"title": "Calentamiento"})
    ok = client.patch(f"{API}/admin/routines/{rid}", headers=admin.headers, json={"status": "active"})

    assert empty.status_code == 422 and empty.json()["error"]["code"] == "routine_empty"
    assert ok.status_code == 200 and ok.json()["status"] == "active"


def test_reorder_steps_validates_the_ids(client, db):
    admin = create_admin(db)
    user = _customer(db)
    rid = _routine(client, admin, user)
    one, two, three = _step_ids(client, admin, rid)
    url = f"{API}/admin/routines/{rid}/steps/order"

    reordered = client.put(url, headers=admin.headers, json={"step_ids": [three, one, two]})
    missing = client.put(url, headers=admin.headers, json={"step_ids": [one, two]})
    repeated = client.put(url, headers=admin.headers, json={"step_ids": [one, one, two]})
    foreign = client.put(url, headers=admin.headers, json={"step_ids": [one, two, 9999]})

    assert [s["id"] for s in reordered.json()["steps"]] == [three, one, two]
    assert [s["position"] for s in reordered.json()["steps"]] == [1, 2, 3]
    assert (missing.status_code, repeated.status_code, foreign.status_code) == (422, 422, 422)
    assert _step_ids(client, admin, rid) == [three, one, two]


def test_deleting_a_step_renumbers_and_removes_its_completions(client, db, frozen_clock):
    admin = create_admin(db)
    user = _customer(db)
    _plus(db, user)
    rid = _routine(client, admin, user)
    one, two, three = _step_ids(client, admin, rid)
    _complete(client, user, rid, one)

    deleted = client.delete(f"{API}/admin/routine-steps/{one}", headers=admin.headers)

    assert deleted.status_code == 200
    assert [(s["id"], s["position"]) for s in deleted.json()["steps"]] == [(two, 1), (three, 2)]
    assert db.scalar(select(func.count()).select_from(RoutineStepCompletion)) == 0


def test_admin_list_shows_progress(client, db, frozen_clock):
    admin = create_admin(db)
    first, second = _customer(db), _customer(db)
    rid = _routine(client, admin, first)
    _routine(client, admin, second)
    _complete(client, first, rid, _step_ids(client, admin, rid)[0])

    everything = client.get(f"{API}/admin/routines", headers=admin.headers).json()
    only_one = client.get(f"{API}/admin/routines?user_id={first.id}", headers=admin.headers).json()

    assert len(everything) == 2
    assert [r["progress_pct"] for r in only_one] == [33]
    assert only_one[0]["user_email"] == first.email
    assert "has_plus" not in only_one[0]


def test_admin_sees_user_progress_with_notes(client, db, frozen_clock):
    admin = create_admin(db)
    user = _customer(db)
    _plus(db, user)
    rid = _routine(client, admin, user)
    _complete(client, user, rid, _step_ids(client, admin, rid)[0], {"minutes": 15, "effort": 5, "note": "Me costó"})

    progress = client.get(f"{API}/admin/routines/{rid}/progress", headers=admin.headers).json()

    assert progress["stats"]["completed_steps"] == 1
    assert progress["steps"][0]["completion"]["note"] == "Me costó"


def test_admin_routine_actions_are_audited(client, db):
    admin = create_admin(db)
    user = _customer(db)
    rid = _routine(client, admin, user)
    one, two, three = _step_ids(client, admin, rid)
    client.patch(f"{API}/admin/routine-steps/{one}", headers=admin.headers, json={"title": "Nuevo título"})
    client.put(f"{API}/admin/routines/{rid}/steps/order", headers=admin.headers, json={"step_ids": [two, one, three]})
    client.delete(f"{API}/admin/routine-steps/{three}", headers=admin.headers)

    logs = client.get(f"{API}/admin/audit-logs?limit=200", headers=admin.headers).json()

    actions = {entry["action"] for entry in logs}
    assert {"routine.create", "routine.update", "routine_step.create", "routine_step.update",
            "routine_step.reorder", "routine_step.delete"} <= actions
    assert all(len(entry["entity_id"]) <= 64 for entry in logs)
