"""CRUD de contenidos, retos y recompensas desde el panel."""

import pytest

from app.models import AdminAuditLog, Challenge, ChallengeParticipation, ContentItem, Reward, RewardRedemption
from tests.factories import create_admin, new_user

BASE = "/api/v1/admin"
PUBLIC_LIST = {"content": "/api/v1/content", "challenges": "/api/v1/challenges", "rewards": "/api/v1/rewards"}


def _content(db, **extra) -> ContentItem:
    item = ContentItem(kind="routine", title="Full body", body="Paso a paso", **extra)
    db.add(item)
    db.commit()
    return item


def _challenge(db, **extra) -> Challenge:
    challenge = Challenge(**{"title": "30 días de agua", "target_count": 30, **extra})
    db.add(challenge)
    db.commit()
    return challenge


def _reward(db, **extra) -> Reward:
    reward = Reward(**{"kind": "habit_discount", "name": "10% de descuento", "threshold_pct": 70, **extra})
    db.add(reward)
    db.commit()
    return reward


def _joined(client, db, challenge) -> None:
    user = new_user()
    assert client.post(f"/api/v1/challenges/{challenge.id}/join", headers=user.headers).status_code == 200
    db.query(ChallengeParticipation).update({"progress": 2})
    db.commit()


def test_patch_content_updates_only_sent_fields_and_audits(client, db):
    # Arrange
    admin = create_admin(db)
    item = _content(db, summary="Resumen original")

    # Act
    response = client.patch(
        f"{BASE}/content/{item.id}",
        json={"title": "Full body en casa", "cover_url": "https://x.supabase.co/portada.jpg", "kind": "recipe"},
        headers=admin.headers,
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Full body en casa" and body["kind"] == "recipe" and body["summary"] == "Resumen original"
    assert body["cover_url"] == "https://x.supabase.co/portada.jpg" and body["body"] == "Paso a paso"
    log = db.query(AdminAuditLog).filter_by(action="content.update").one()
    assert log.entity_id == str(item.id)
    assert log.details["changed_fields"] == ["cover_url", "kind", "title"]


@pytest.mark.parametrize("resource,builder,bad,extra", [
    ("content", _content, {"title": "x"}, {"access": "plus"}),
    ("challenges", _challenge, {"target_count": 0}, {"slug": "x"}),
    ("rewards", _reward, {"threshold_pct": 500}, {"kind": "challenge"}),
])
def test_patch_rejects_invalid_values_and_extra_fields(client, db, resource, builder, bad, extra):
    # Arrange
    admin = create_admin(db)
    obj = builder(db)
    url = f"{BASE}/{resource}/{obj.id}"

    # Act / Assert
    assert client.patch(url, json=bad, headers=admin.headers).status_code == 422
    assert client.patch(url, json=extra, headers=admin.headers).status_code == 422


def test_patch_challenge_and_reward_audit_changed_fields(client, db):
    # Arrange
    admin = create_admin(db)
    challenge, reward = _challenge(db), _reward(db)

    # Act
    c = client.patch(f"{BASE}/challenges/{challenge.id}", json={"target_count": 21}, headers=admin.headers)
    r = client.patch(f"{BASE}/rewards/{reward.id}", json={"name": "15% de descuento"}, headers=admin.headers)

    # Assert
    assert c.json()["target_count"] == 21 and c.json()["title"] == "30 días de agua"
    assert r.json()["name"] == "15% de descuento" and r.json()["threshold_pct"] == 70
    details = {log.action: log.details["changed_fields"] for log in db.query(AdminAuditLog).all()}
    assert details == {"challenge.update": ["target_count"], "reward.update": ["name"]}


@pytest.mark.parametrize("resource,builder,flag", [
    ("content", _content, "is_published"),
    ("challenges", _challenge, "is_active"),
    ("rewards", _reward, "is_active"),
])
def test_archive_hides_from_public_and_admin_default_and_restore_shows_again(client, db, resource, builder, flag):
    # Arrange
    admin = create_admin(db)
    obj = builder(db)
    url = f"{BASE}/{resource}"
    public = lambda: client.get(PUBLIC_LIST[resource], headers=admin.headers).json()  # noqa: E731
    public_ids = lambda: [x["id"] for x in (public() if resource == "content" else public()[resource])]  # noqa: E731

    # Act
    archived = client.post(f"{url}/{obj.id}/archive", headers=admin.headers)
    after_archive = public_ids()
    admin_default = [x["id"] for x in client.get(url, headers=admin.headers).json()]
    admin_all = [x["id"] for x in client.get(url, params={"include_archived": "true"}, headers=admin.headers).json()]
    restored = client.post(f"{url}/{obj.id}/restore", headers=admin.headers)

    # Assert
    assert archived.status_code == 200 and archived.json()[flag] is False
    assert obj.id not in after_archive and obj.id not in admin_default and obj.id in admin_all
    assert restored.json()[flag] is True and obj.id in public_ids()
    assert {log.action for log in db.query(AdminAuditLog).all()} >= {f"{resource.rstrip('s') if resource != 'content' else 'content'}.archive"}


def test_delete_content_removes_it(client, db):
    # Arrange
    admin = create_admin(db)
    item_id = _content(db).id

    # Act
    response = client.delete(f"{BASE}/content/{item_id}", headers=admin.headers)

    # Assert
    assert response.status_code == 204
    db.expire_all()
    assert db.get(ContentItem, item_id) is None
    assert db.query(AdminAuditLog).filter_by(action="content.delete", entity_id=str(item_id)).count() == 1


def test_delete_challenge_without_participants_is_real_and_with_participants_is_409(client, db):
    # Arrange
    admin = create_admin(db)
    free, busy = _challenge(db), _challenge(db, title="Reto con gente")
    free_id, busy_id = free.id, busy.id
    _joined(client, db, busy)

    # Act
    deleted = client.delete(f"{BASE}/challenges/{free_id}", headers=admin.headers)
    blocked = client.delete(f"{BASE}/challenges/{busy_id}", headers=admin.headers)

    # Assert
    assert deleted.status_code == 204
    error = blocked.json()["error"]
    assert blocked.status_code == 409 and error["code"] == "RESOURCE_IN_USE"
    assert error["details"] == {"participants": 1, "with_progress": 1}
    assert "1 participante" in error["message"] and "archivarlo" in error["message"]
    db.expire_all()
    assert db.get(Challenge, free_id) is None and db.get(Challenge, busy_id) is not None


def test_delete_reward_with_redemptions_is_409(client, db):
    # Arrange
    admin, user = create_admin(db), new_user()
    used, free = _reward(db), _reward(db, name="Otra recompensa")
    client.get("/api/v1/habits", headers=user.headers)
    db.add(RewardRedemption(reward_id=used.id, user_id=user.id))
    db.commit()

    # Act
    blocked = client.delete(f"{BASE}/rewards/{used.id}", headers=admin.headers)
    deleted = client.delete(f"{BASE}/rewards/{free.id}", headers=admin.headers)

    # Assert
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "RESOURCE_IN_USE"
    assert blocked.json()["error"]["details"] == {"redemptions": 1}
    assert deleted.status_code == 204


@pytest.mark.parametrize("resource", ["content", "challenges", "rewards"])
def test_routes_404_401_403(client, db, resource):
    # Arrange
    admin, customer = create_admin(db), new_user()

    # Act / Assert
    for method, suffix in [("delete", ""), ("post", "/archive"), ("post", "/restore")]:
        call = getattr(client, method)
        path = f"{BASE}/{resource}/9999{suffix}"
        assert call(path, headers=admin.headers).status_code == 404, path
        assert call(path).status_code == 401, path
        assert call(path, headers=customer.headers).status_code == 403, path
    assert client.patch(f"{BASE}/{resource}/9999", json={}, headers=admin.headers).status_code == 404
    assert client.patch(f"{BASE}/{resource}/9999", json={}).status_code == 401
    assert client.patch(f"{BASE}/{resource}/9999", json={}, headers=customer.headers).status_code == 403
