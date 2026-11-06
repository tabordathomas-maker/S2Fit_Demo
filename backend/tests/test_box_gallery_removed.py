"""La galería de fotos de S2 Box se eliminó: las Cajas S2 Box la reemplazan. Lo que debe seguir funcionando."""

from app.main import app
from app.models import AdminAuditLog
from app.services import storage
from tests.factories import create_admin, new_user

API = "/api/v1"
UPLOAD = f"{API}/admin/uploads/s2box-image"
PORTADA = "https://test-project.supabase.co/storage/v1/object/public/product-images/s2box/portada.jpg"


def test_cover_upload_still_works_for_admin_and_is_audited(client, db, monkeypatch):
    # Arrange
    admin = create_admin(db)
    monkeypatch.setattr(storage, "upload_box_image", lambda content, content_type: PORTADA)

    # Act
    response = client.post(UPLOAD, files={"file": ("portada.png", b"0000", "image/png")}, headers=admin.headers)

    # Assert
    assert response.status_code == 200 and response.json() == {"url": PORTADA}
    log = db.query(AdminAuditLog).filter_by(action="upload.box_image").one()
    assert log.entity_type == "storage" and log.details == {"filename": "portada.png"}


def test_cover_upload_is_forbidden_for_customers_and_anonymous(client):
    files = {"file": ("portada.png", b"0000", "image/png")}

    assert client.post(UPLOAD, files=files).status_code == 401
    assert client.post(UPLOAD, files=files, headers=new_user().headers).status_code == 403


def test_gallery_routes_no_longer_exist(client, db):
    admin = create_admin(db)

    assert client.get(f"{API}/s2box/images").status_code == 404
    assert client.get(f"{API}/admin/s2box/images", headers=admin.headers).status_code == 404
    assert client.post(f"{API}/admin/s2box/images", json={"url": PORTADA}, headers=admin.headers).status_code in (404, 405)
    paths = {route.path for route in app.routes}
    assert not [p for p in paths if p.endswith("/images") or "/images/" in p]


def test_old_box_image_audit_events_still_list_as_foto_numero(client, db):
    # Arrange: un evento de cuando la galería existía; su fila ya no está en la base.
    admin = create_admin(db)
    db.add(AdminAuditLog(admin_id=admin.id, action="box_image.create", entity_type="box_image", entity_id="7", details={}))
    db.commit()

    # Act
    response = client.get(f"{API}/admin/audit-logs", headers=admin.headers)

    # Assert
    assert response.status_code == 200
    events = response.json()["events"]
    assert len(events) == 1
    assert events[0]["entity"]["name"] == "foto #7" and events[0]["entity"]["type"] == "Foto de la caja"
    assert "foto #7" in str(events[0])


def test_routes_called_by_frontend_exist():
    paths = {(route.path, method) for route in app.routes for method in getattr(route, "methods", ())}
    for expected in [
        (f"{API}/s2box/boxes", "GET"),
        (f"{API}/s2box/boxes/{{box_id}}/content", "GET"),
        (f"{API}/s2box/claims/me", "GET"),
        (f"{API}/admin/s2box/boxes", "GET"),
        (f"{API}/admin/s2box/boxes", "POST"),
        (UPLOAD, "POST"),
        (f"{API}/admin/uploads/content-media", "POST"),
    ]:
        assert expected in paths, expected
