"""Cajas S2 Box: portada pública, contenido por membresía, CRUD del panel y reclamos ligados a cada caja."""

from app.core import clock
from app.main import app
from app.models import AdminAuditLog, BoxClaim, MysteryBox
from tests.factories import SUPABASE_STORAGE, activate_membership, create_admin, create_box, new_user

CREATE_BODY = {
    "title": "Caja Aurora",
    "teaser": "Descúbrela",
    "cover_url": f"{SUPABASE_STORAGE}/s2box/aurora.jpg",
    "cover_alt": "Caja Aurora",
    "content_media_url": "https://www.youtube.com/watch?v=abc123",
    "content_description": "Rutina secreta",
    "content_access": "plus",
}


# --- Lista pública ---


def test_public_list_has_only_the_cover(client, db):
    # Arrange
    create_box(db, title="Caja Soul")
    create_box(db, title="Oculta", active=False)

    # Act
    response = client.get("/api/v1/s2box/boxes")

    # Assert
    assert response.status_code == 200
    boxes = response.json()
    assert [b["title"] for b in boxes] == ["Caja Soul"]
    assert set(boxes[0]) == {"id", "title", "teaser", "cover_url", "cover_alt", "content_access"}
    assert "content_media_url" not in response.text and "Contenido secreto" not in response.text


# --- Contenido ---


def test_plus_content_requires_login(client, db):
    # Arrange
    box = create_box(db, access="plus")

    # Act
    response = client.get(f"/api/v1/s2box/boxes/{box.id}/content")

    # Assert
    assert response.status_code == 403
    error = response.json()["error"]
    assert error["code"] == "membership_required"
    assert error["details"]["login_required"] is True


def test_plus_content_requires_active_membership(client, db):
    # Arrange
    box, user = create_box(db, access="plus"), new_user()
    client.get("/api/v1/me", headers=user.headers)

    # Act
    response = client.get(f"/api/v1/s2box/boxes/{box.id}/content", headers=user.headers)

    # Assert
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "membership_required"
    assert response.json()["error"]["details"]["login_required"] is False


def test_plus_content_opens_with_active_membership(client, db):
    # Arrange
    box, user = create_box(db, access="plus"), new_user()
    activate_membership(client, db, user)

    # Act
    response = client.get(f"/api/v1/s2box/boxes/{box.id}/content", headers=user.headers)

    # Assert
    assert response.status_code == 200
    assert response.json()["content_description"] == "Contenido secreto de la caja"
    assert response.json()["content_media_url"].startswith("https://")


def test_expired_membership_does_not_open_plus_content(client, db, frozen_clock):
    # Arrange
    box, user = create_box(db, access="plus"), new_user()
    activate_membership(client, db, user)
    frozen_clock.advance(days=40)

    # Act
    response = client.get(f"/api/v1/s2box/boxes/{box.id}/content", headers=user.headers)

    # Assert
    assert response.status_code == 403


def test_free_content_opens_for_anyone(client, db):
    # Arrange
    box = create_box(db, access="free")

    # Act
    response = client.get(f"/api/v1/s2box/boxes/{box.id}/content")

    # Assert
    assert response.status_code == 200


def test_inactive_box_content_is_not_found(client, db):
    # Arrange
    box = create_box(db, access="free", active=False)

    # Act / Assert
    assert client.get(f"/api/v1/s2box/boxes/{box.id}/content").status_code == 404


# --- Reclamos ---


def test_claim_creates_reference_and_exact_whatsapp_message(client, db):
    # Arrange
    box, user = create_box(db), new_user()
    activate_membership(client, db, user)
    client.patch("/api/v1/me", json={"full_name": "Laura Gómez"}, headers=user.headers)

    # Act
    response = client.post(f"/api/v1/s2box/boxes/{box.id}/claims", json={}, headers=user.headers)

    # Assert
    assert response.status_code == 201
    body = response.json()
    assert body["reference"].startswith("S2-BOX-") and body["status"] == "pending" and body["box_title"] == "Caja Soul"
    assert body["whatsapp_message"] == f"Soy Laura Gómez quiero reclamar mi S2 Box con referencia {body['reference']}"
    assert body["already_existed"] is False


def test_claim_message_uses_email_without_full_name(client, db):
    # Arrange
    box, user = create_box(db), new_user()
    activate_membership(client, db, user)

    # Act
    body = client.post(f"/api/v1/s2box/boxes/{box.id}/claims", json={}, headers=user.headers).json()

    # Assert
    assert body["whatsapp_message"].startswith(f"Soy {user.email} quiero reclamar")


def test_claim_is_idempotent_while_pending(client, db):
    # Arrange
    box, user = create_box(db), new_user()
    activate_membership(client, db, user)
    first = client.post(f"/api/v1/s2box/boxes/{box.id}/claims", json={}, headers=user.headers).json()

    # Act
    second = client.post(f"/api/v1/s2box/boxes/{box.id}/claims", json={}, headers=user.headers)

    # Assert
    assert second.status_code == 200
    assert second.json()["id"] == first["id"] and second.json()["already_existed"] is True
    assert db.query(BoxClaim).count() == 1


def test_claim_without_membership_is_forbidden(client, db):
    # Arrange
    box, user = create_box(db, access="plus"), new_user()
    client.get("/api/v1/me", headers=user.headers)

    # Act
    response = client.post(f"/api/v1/s2box/boxes/{box.id}/claims", json={}, headers=user.headers)

    # Assert
    assert response.status_code == 403 and db.query(BoxClaim).count() == 0


def test_claim_requires_login(client, db):
    box = create_box(db)
    assert client.post(f"/api/v1/s2box/boxes/{box.id}/claims", json={}).status_code == 401


def test_accepted_claim_blocks_a_new_one_but_rejected_does_not(client, db):
    # Arrange
    admin, user, box = create_admin(db), new_user(), create_box(db)
    activate_membership(client, db, user)
    first = client.post(f"/api/v1/s2box/boxes/{box.id}/claims", json={}, headers=user.headers).json()
    client.post(f"/api/v1/admin/s2box/claims/{first['id']}/reject", json={}, headers=admin.headers)
    second = client.post(f"/api/v1/s2box/boxes/{box.id}/claims", json={}, headers=user.headers).json()
    client.post(f"/api/v1/admin/s2box/claims/{second['id']}/accept", json={}, headers=admin.headers)

    # Act
    third = client.post(f"/api/v1/s2box/boxes/{box.id}/claims", json={}, headers=user.headers)

    # Assert
    assert second["id"] != first["id"]
    assert third.status_code == 409 and third.json()["error"]["code"] == "box_already_claimed"


def test_claim_of_missing_or_deleted_box_is_not_found(client, db):
    # Arrange
    admin, user, box = create_admin(db), new_user(), create_box(db)
    activate_membership(client, db, user)
    missing = client.post("/api/v1/s2box/boxes/9999/claims", json={}, headers=user.headers)
    client.post(f"/api/v1/s2box/boxes/{box.id}/claims", json={}, headers=user.headers)
    client.delete(f"/api/v1/admin/s2box/boxes/{box.id}", headers=admin.headers)

    # Act
    deleted = client.post(f"/api/v1/s2box/boxes/{box.id}/claims", json={}, headers=user.headers)

    # Assert
    assert missing.status_code == 404 and deleted.status_code == 404


# --- Administración ---


def test_admin_crud_of_boxes(client, db):
    # Arrange
    admin = create_admin(db)

    # Act
    created = client.post("/api/v1/admin/s2box/boxes", json=CREATE_BODY, headers=admin.headers)
    box_id = created.json()["id"]
    listed = client.get("/api/v1/admin/s2box/boxes", headers=admin.headers)
    updated = client.patch(f"/api/v1/admin/s2box/boxes/{box_id}",
                           json={"title": "Caja Aurora 2", "content_access": "free", "is_active": False}, headers=admin.headers)
    deleted = client.delete(f"/api/v1/admin/s2box/boxes/{box_id}", headers=admin.headers)

    # Assert
    assert created.status_code == 201 and created.json()["content_access"] == "plus"
    assert [b["id"] for b in listed.json()] == [box_id]
    assert updated.status_code == 200
    assert (updated.json()["title"], updated.json()["content_access"], updated.json()["is_active"]) == ("Caja Aurora 2", "free", False)
    assert deleted.status_code == 204
    assert db.query(MysteryBox).count() == 0  # sin reclamos: borrado real
    actions = {log.action for log in db.query(AdminAuditLog)}
    assert {"mystery_box.create", "mystery_box.update", "mystery_box.delete"} <= actions


def test_admin_validates_box_input(client, db):
    admin = create_admin(db)
    bad = {**CREATE_BODY, "cover_url": "http://inseguro.test/a.jpg"}
    assert client.post("/api/v1/admin/s2box/boxes", json=bad, headers=admin.headers).status_code == 422
    bad_access = {**CREATE_BODY, "content_access": "vip"}
    assert client.post("/api/v1/admin/s2box/boxes", json=bad_access, headers=admin.headers).status_code == 422


def test_customer_cannot_use_admin_box_routes(client, db):
    # Arrange
    user, box = new_user(), create_box(db)
    client.get("/api/v1/me", headers=user.headers)

    # Act / Assert
    assert client.get("/api/v1/admin/s2box/boxes", headers=user.headers).status_code == 403
    assert client.post("/api/v1/admin/s2box/boxes", json=CREATE_BODY, headers=user.headers).status_code == 403
    assert client.patch(f"/api/v1/admin/s2box/boxes/{box.id}", json={"title": "X1"}, headers=user.headers).status_code == 403
    assert client.delete(f"/api/v1/admin/s2box/boxes/{box.id}", headers=user.headers).status_code == 403
    assert client.get("/api/v1/admin/s2box/claims", headers=user.headers).status_code == 403


def test_deleting_a_box_with_claims_hides_it_but_keeps_the_history(client, db):
    # Arrange
    admin, user, box = create_admin(db), new_user(), create_box(db, access="free")
    client.get("/api/v1/me", headers=user.headers)
    client.post(f"/api/v1/s2box/boxes/{box.id}/claims", json={}, headers=user.headers)

    # Act
    deleted = client.delete(f"/api/v1/admin/s2box/boxes/{box.id}", headers=admin.headers)

    # Assert
    assert deleted.status_code == 204
    assert client.get("/api/v1/s2box/boxes").json() == []
    assert client.get("/api/v1/admin/s2box/boxes", headers=admin.headers).json() == []
    db.expire_all()
    stored = db.get(MysteryBox, box.id)
    assert stored is not None and stored.deleted_at is not None and stored.is_active is False
    claims = client.get("/api/v1/admin/s2box/claims", headers=admin.headers).json()
    assert claims[0]["box_title"] == "Caja Soul"
    assert db.query(AdminAuditLog).filter_by(action="mystery_box.soft_delete").count() == 1


def test_admin_lists_claims_with_phone_and_decides(client, db, frozen_clock):
    # Arrange
    admin, user, box = create_admin(db), new_user(), create_box(db, access="free")
    client.get("/api/v1/me", headers=user.headers)
    client.patch("/api/v1/me", json={"full_name": "Laura Gómez", "phone": "3001234567"}, headers=user.headers)
    claim = client.post(f"/api/v1/s2box/boxes/{box.id}/claims", json={}, headers=user.headers).json()
    frozen_clock.advance(minutes=10)

    # Act
    pending = client.get("/api/v1/admin/s2box/claims?status=pending", headers=admin.headers).json()
    decided = client.post(f"/api/v1/admin/s2box/claims/{claim['id']}/reject", json={"admin_notes": "Sin stock"}, headers=admin.headers)
    again = client.post(f"/api/v1/admin/s2box/claims/{claim['id']}/accept", json={}, headers=admin.headers)

    # Assert
    assert pending[0]["customer_phone"].endswith("3001234567") and pending[0]["box_title"] == "Caja Soul"
    assert decided.status_code == 200 and decided.json()["status"] == "rejected"
    stored = db.query(BoxClaim).one()
    assert stored.decided_by == admin.id and stored.decided_at == clock.now() and stored.admin_notes == "Sin stock"
    assert db.query(AdminAuditLog).filter_by(action="box_claim.rejected", admin_id=admin.id).count() == 1
    assert again.status_code == 409
    assert client.get("/api/v1/admin/s2box/claims?status=pending", headers=admin.headers).json() == []


def test_routes_called_by_frontend_exist():
    paths = {(route.path, method) for route in app.routes for method in getattr(route, "methods", ())}
    expected = {
        ("/api/v1/s2box/boxes", "GET"),
        ("/api/v1/s2box/boxes/{box_id}/content", "GET"),
        ("/api/v1/s2box/boxes/{box_id}/claims", "POST"),
        ("/api/v1/s2box/claims/me", "GET"),
        ("/api/v1/admin/s2box/boxes", "GET"),
        ("/api/v1/admin/s2box/boxes", "POST"),
        ("/api/v1/admin/s2box/boxes/{box_id}", "PATCH"),
        ("/api/v1/admin/s2box/boxes/{box_id}", "DELETE"),
        ("/api/v1/admin/s2box/claims", "GET"),
        ("/api/v1/admin/s2box/claims/{claim_id}/accept", "POST"),
        ("/api/v1/admin/s2box/claims/{claim_id}/reject", "POST"),
        ("/api/v1/admin/uploads/s2box-image", "POST"),
        ("/api/v1/admin/uploads/content-media", "POST"),
    }
    assert expected <= paths
