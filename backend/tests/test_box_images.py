"""Galería de S2 Box: lectura pública, administración, auditoría y migración."""

import os

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.core.database import engine
from app.models import AdminAuditLog, BoxImage
from tests.conftest import BACKEND_DIR, TEST_DATABASE_URL
from tests.factories import create_admin, new_user

PUBLIC = "/api/v1/s2box/images"
ADMIN = "/api/v1/admin/s2box/images"
URL = "https://x.supabase.co/storage/v1/object/public/product-images/s2box/{}.jpg"


def _image(db, name: str, order: int = 0, active: bool = True) -> BoxImage:
    image = BoxImage(url=URL.format(name), alt_text=name, sort_order=order, is_active=active)
    db.add(image)
    db.commit()
    return image


def _create(client, admin, name="caja", **extra):
    return client.post(ADMIN, json={"url": URL.format(name), "alt_text": name, **extra}, headers=admin.headers)


def test_public_gallery_returns_only_active_images_in_order(client, db):
    # Arrange
    _image(db, "tercera", order=5)
    _image(db, "oculta", order=0, active=False)
    _image(db, "primera", order=1)
    _image(db, "segunda", order=1)

    # Act
    response = client.get(PUBLIC)

    # Assert
    assert response.status_code == 200
    assert [i["alt_text"] for i in response.json()] == ["primera", "segunda", "tercera"]
    assert "is_active" not in response.json()[0]


def test_public_gallery_is_empty_without_images(client):
    assert client.get(PUBLIC).json() == []


def test_admin_creates_edits_deactivates_and_deletes_with_audit(client, db):
    # Arrange
    admin = create_admin(db)

    # Act
    created = _create(client, admin, sort_order=2)
    image_id = created.json()["id"]
    edited = client.patch(f"{ADMIN}/{image_id}", json={"alt_text": "Caja de marzo"}, headers=admin.headers)
    hidden = client.patch(f"{ADMIN}/{image_id}", json={"is_active": False}, headers=admin.headers)
    listed = client.get(ADMIN, headers=admin.headers)
    public = client.get(PUBLIC)
    deleted = client.delete(f"{ADMIN}/{image_id}", headers=admin.headers)

    # Assert
    assert created.status_code == 201 and created.json()["is_active"] is True
    assert edited.json()["alt_text"] == "Caja de marzo" and edited.json()["sort_order"] == 2
    assert hidden.json()["is_active"] is False
    assert [i["id"] for i in listed.json()] == [image_id] and public.json() == []
    assert deleted.status_code == 204 and client.get(ADMIN, headers=admin.headers).json() == []
    logs = db.query(AdminAuditLog).filter(AdminAuditLog.entity_type == "box_image").order_by(AdminAuditLog.id).all()
    assert [log.action for log in logs] == [
        "box_image.create", "box_image.update", "box_image.update", "box_image.delete",
    ]
    assert {log.entity_id for log in logs} == {str(image_id)}


def test_customer_gets_403_and_anonymous_gets_401_on_admin_routes(client, db):
    customer = new_user()
    image = _image(db, "caja")
    calls = [
        lambda h: client.get(ADMIN, headers=h),
        lambda h: client.post(ADMIN, json={"url": URL.format("x")}, headers=h),
        lambda h: client.patch(f"{ADMIN}/{image.id}", json={"is_active": False}, headers=h),
        lambda h: client.delete(f"{ADMIN}/{image.id}", headers=h),
    ]

    assert [call(customer.headers).status_code for call in calls] == [403, 403, 403, 403]
    assert [call({}).status_code for call in calls] == [401, 401, 401, 401]
    assert db.query(BoxImage).count() == 1


def test_invalid_input_is_rejected(client, db):
    admin = create_admin(db)
    image = _image(db, "caja")

    extra_field = client.post(ADMIN, json={"url": URL.format("a"), "owner": "x"}, headers=admin.headers)
    http_url = client.post(ADMIN, json={"url": "http://x.com/a.jpg"}, headers=admin.headers)
    long_alt = client.post(ADMIN, json={"url": URL.format("a"), "alt_text": "a" * 201}, headers=admin.headers)
    negative = client.patch(f"{ADMIN}/{image.id}", json={"sort_order": -1}, headers=admin.headers)

    assert [r.status_code for r in (extra_field, http_url, long_alt, negative)] == [422, 422, 422, 422]


def test_unknown_id_returns_404_in_error_format(client, db):
    admin = create_admin(db)

    patched = client.patch(f"{ADMIN}/9999", json={"is_active": False}, headers=admin.headers)
    deleted = client.delete(f"{ADMIN}/9999", headers=admin.headers)

    for response in (patched, deleted):
        assert response.status_code == 404
        error = response.json()["error"]
        assert error["code"] == "not_found" and error["message"] and error["details"] == {}


def test_upload_requires_admin_and_storage_configuration(client, db):
    files = {"file": ("caja.png", b"0000", "image/png")}

    anonymous = client.post("/api/v1/admin/uploads/s2box-image", files=files)
    customer = client.post("/api/v1/admin/uploads/s2box-image", files=files, headers=new_user().headers)
    admin = client.post("/api/v1/admin/uploads/s2box-image", files=files, headers=create_admin(db).headers)

    assert (anonymous.status_code, customer.status_code) == (401, 403)
    assert admin.status_code == 503  # sin SUPABASE_SERVICE_ROLE_KEY en pruebas


def test_migration_0005_downgrades_and_upgrades_again():
    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    cfg.attributes["database_url"] = TEST_DATABASE_URL
    engine.dispose()
    try:
        command.downgrade(cfg, "0004")
        assert "box_images" not in inspect(engine).get_table_names()
    finally:
        engine.dispose()
        command.upgrade(cfg, "head")
    engine.dispose()
    assert "box_images" in inspect(engine).get_table_names()
