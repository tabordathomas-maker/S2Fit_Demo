"""Hábitos, retos, recompensas y contenido gratuito."""

from datetime import date, timedelta

from app.models import Challenge, ContentItem, Reward
from tests.factories import create_admin, create_plan, new_user

TODAY = date(2026, 3, 2)  # coincide con frozen_clock (15:00 UTC = 10:00 en Bogotá)


def test_free_content_is_public(client, db):
    # Arrange
    db.add(ContentItem(kind="routine", title="Full body sin equipo", access="free", body="Paso a paso"))
    db.commit()

    # Act
    listing = client.get("/api/v1/content", params={"kind": "routine"})

    # Assert
    assert listing.status_code == 200
    assert "locked" not in listing.json()[0] and listing.json()[0]["body"] == "Paso a paso"


def test_content_marked_plus_is_public_without_membership(client, db):
    item = ContentItem(kind="meal", title="Cena del día", access="plus")
    db.add(item)
    db.commit()
    assert client.get(f"/api/v1/content/{item.id}").status_code == 200


def test_default_habits_are_created_and_logs_persist(client, frozen_clock):
    # Arrange
    user = new_user()
    habits = client.get("/api/v1/habits", headers=user.headers).json()["today"]["habits"]

    # Act
    response = client.put(f"/api/v1/habits/{habits[0]['id']}/log", json={"date": str(TODAY), "completed": True},
                          headers=user.headers)
    reloaded = client.get("/api/v1/habits", headers=user.headers).json()

    # Assert
    assert len(habits) == 5
    assert response.status_code == 200
    assert reloaded["today"]["percent"] == 20
    assert reloaded["today"]["habits"][0]["completed"] is True
    assert reloaded["history"][0] == {"date": str(TODAY), "completed": 1, "total": 5, "percent": 20}


def test_habit_history_by_day(client, frozen_clock):
    # Arrange
    user = new_user()
    habits = client.get("/api/v1/habits", headers=user.headers).json()["today"]["habits"]
    yesterday = TODAY - timedelta(days=1)
    for habit in habits:
        client.put(f"/api/v1/habits/{habit['id']}/log", json={"date": str(yesterday), "completed": True},
                   headers=user.headers)

    # Act
    history = client.get("/api/v1/habits", headers=user.headers).json()["history"]

    # Assert
    assert history[1] == {"date": str(yesterday), "completed": 5, "total": 5, "percent": 100}
    assert history[0]["percent"] == 0


def test_users_cannot_log_other_users_habits(client, frozen_clock):
    # Arrange
    alice, bob = new_user(), new_user()
    alice_habit = client.get("/api/v1/habits", headers=alice.headers).json()["today"]["habits"][0]

    # Act
    response = client.put(f"/api/v1/habits/{alice_habit['id']}/log", json={"date": str(TODAY), "completed": True},
                          headers=bob.headers)

    # Assert
    assert response.status_code == 404
    assert client.get("/api/v1/habits", headers=alice.headers).json()["today"]["completed"] == 0


def test_future_habit_dates_are_rejected(client, frozen_clock):
    user = new_user()
    habit = client.get("/api/v1/habits", headers=user.headers).json()["today"]["habits"][0]
    response = client.put(f"/api/v1/habits/{habit['id']}/log",
                          json={"date": str(TODAY + timedelta(days=1)), "completed": True}, headers=user.headers)
    assert response.status_code == 422


def test_custom_habit_can_be_added_and_removed(client, frozen_clock):
    user = new_user()
    created = client.post("/api/v1/habits", json={"name": "Leer 10 páginas"}, headers=user.headers).json()
    habit_id = next(h["id"] for h in created["today"]["habits"] if h["name"] == "Leer 10 páginas")
    removed = client.delete(f"/api/v1/habits/{habit_id}", headers=user.headers).json()
    assert created["today"]["total"] == 6 and removed["today"]["total"] == 5


def test_challenge_marked_plus_can_be_joined_without_membership(client, db, frozen_clock):
    # Arrange
    challenge = Challenge(title="7 días de movimiento", access="plus", target_count=7)
    db.add(challenge)
    db.commit()
    user = new_user()

    # Act
    joined = client.post(f"/api/v1/challenges/{challenge.id}/join", headers=user.headers)
    progressed = client.post(f"/api/v1/challenges/{challenge.id}/progress", headers=user.headers)

    # Assert
    assert joined.status_code == 200 and progressed.status_code == 200
    item = progressed.json()["challenges"][0]
    assert "locked" not in item and item["joined"] is True and item["progress"] == 1


def test_free_challenge_progress_once_per_day_until_completed(client, db, frozen_clock):
    # Arrange
    challenge = Challenge(title="Primera semana", access="free", target_count=2)
    db.add(challenge)
    db.commit()
    user = new_user()
    client.post(f"/api/v1/challenges/{challenge.id}/join", headers=user.headers)

    # Act
    day_one = client.post(f"/api/v1/challenges/{challenge.id}/progress", headers=user.headers)
    same_day = client.post(f"/api/v1/challenges/{challenge.id}/progress", headers=user.headers)
    frozen_clock.advance(days=1)
    day_two = client.post(f"/api/v1/challenges/{challenge.id}/progress", headers=user.headers).json()

    # Assert
    assert day_one.status_code == 200
    assert same_day.status_code == 409
    assert day_two["challenges"][0]["completed"] is True
    assert day_two["challenge_percent"] == 100


def test_habit_reward_unlocks_with_weekly_compliance(client, db, frozen_clock):
    # Arrange
    reward = Reward(kind="habit_discount", name="3% dcto.", threshold_pct=10, access="free")
    db.add(reward)
    db.commit()
    user = new_user()
    habits = client.get("/api/v1/habits", headers=user.headers).json()["today"]["habits"]
    locked = client.post(f"/api/v1/rewards/{reward.id}/redeem", headers=user.headers)

    # Act
    for offset in range(4):
        client.put(f"/api/v1/habits/{habits[0]['id']}/log",
                   json={"date": str(TODAY - timedelta(days=offset)), "completed": True}, headers=user.headers)
    summary = client.get("/api/v1/rewards", headers=user.headers).json()
    redeemed = client.post(f"/api/v1/rewards/{reward.id}/redeem", headers=user.headers)
    again = client.post(f"/api/v1/rewards/{reward.id}/redeem", headers=user.headers)

    # Assert
    assert locked.status_code == 409 and locked.json()["error"]["code"] == "reward_locked"
    assert summary["habit_percent"] == 11  # 4 de 35 registros posibles en 7 días
    assert summary["rewards"][0]["unlocked"] is True
    assert redeemed.status_code == 201
    assert again.status_code == 409


def test_reward_marked_plus_can_be_redeemed_without_membership(client, db, frozen_clock):
    # Arrange
    reward = Reward(kind="habit_discount", name="10% dcto.", threshold_pct=10, access="plus")
    db.add(reward)
    db.commit()
    user = new_user()
    habit = client.get("/api/v1/habits", headers=user.headers).json()["today"]["habits"][0]
    for offset in range(4):
        client.put(f"/api/v1/habits/{habit['id']}/log",
                   json={"date": str(TODAY - timedelta(days=offset)), "completed": True}, headers=user.headers)

    # Act
    summary = client.get("/api/v1/rewards", headers=user.headers).json()
    redeemed = client.post(f"/api/v1/rewards/{reward.id}/redeem", headers=user.headers)

    # Assert
    assert summary["rewards"][0]["unlocked"] is True and "access" not in summary["rewards"][0]
    assert redeemed.status_code == 201


def test_admin_fulfills_redemption(client, db, frozen_clock):
    # Arrange
    admin = create_admin(db)
    reward = Reward(kind="habit_discount", name="Bono", threshold_pct=1, access="free")
    db.add(reward)
    db.commit()
    user = new_user()
    habit = client.get("/api/v1/habits", headers=user.headers).json()["today"]["habits"][0]
    client.put(f"/api/v1/habits/{habit['id']}/log", json={"date": str(TODAY), "completed": True}, headers=user.headers)
    client.post(f"/api/v1/rewards/{reward.id}/redeem", headers=user.headers)
    redemption = client.get("/api/v1/admin/redemptions", headers=admin.headers).json()[0]

    # Act
    response = client.post(f"/api/v1/admin/redemptions/{redemption['id']}/decision",
                           json={"status": "fulfilled", "admin_notes": "Código enviado"}, headers=admin.headers)

    # Assert
    assert response.status_code == 200 and response.json()["status"] == "fulfilled"
