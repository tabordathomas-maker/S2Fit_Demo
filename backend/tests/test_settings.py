"""WhatsApp editable de la tienda, nombramiento de administradores y subida de archivos."""

import pytest

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import ContentItem, Profile
from app.services import storage
from app.services.site_settings import normalize_whatsapp
from scripts.set_role import assign_role
from tests.factories import create_admin, new_user


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("+57 300 123 4567", "573001234567"),
        ("3001234567", "573001234567"),
        ("57-300-123-4567", "573001234567"),
        ("300 123 4567", "573001234567"),
        ("", None),
    ],
)
def test_whatsapp_numbers_are_normalized(raw, expected):
    assert normalize_whatsapp(raw) == expected


@pytest.mark.parametrize("raw", ["123", "abc3001234567", "1234567890123456", "+1 (415) 555-0100", "6041234567"])
def test_invalid_whatsapp_numbers_are_rejected(raw):
    with pytest.raises(AppError):
        normalize_whatsapp(raw)


def test_public_settings_start_empty(client):
    response = client.get("/api/v1/settings")
    assert response.status_code == 200
    assert response.json() == {"whatsapp_number": None}


def test_admin_updates_whatsapp_and_it_is_public(client, db):
    # Arrange
    admin = create_admin(db)

    # Act
    response = client.put("/api/v1/admin/settings", json={"whatsapp_number": "+57 310 555 1234"}, headers=admin.headers)

    # Assert
    assert response.status_code == 200
    assert response.json()["whatsapp_number"] == "573105551234"
    assert response.json()["updated_by_email"] == admin.email
    assert client.get("/api/v1/settings").json()["whatsapp_number"] == "573105551234"
    logs = client.get("/api/v1/admin/audit-logs", params={"action": "settings.whatsapp_update"}, headers=admin.headers)
    assert logs.json()[0]["details"] == {"from": None, "to": "573105551234"}


def test_admin_cannot_save_invalid_whatsapp(client, db):
    admin = create_admin(db)
    response = client.put("/api/v1/admin/settings", json={"whatsapp_number": "12"}, headers=admin.headers)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_whatsapp_number"


def test_customers_cannot_change_whatsapp(client):
    customer = new_user()
    response = client.put("/api/v1/admin/settings", json={"whatsapp_number": "573001112233"}, headers=customer.headers)
    assert response.status_code == 403


def test_new_admin_registered_phone_becomes_store_whatsapp(client, db):
    # Arrange: la persona se registró en la web con su celular.
    user = new_user()
    db.add(Profile(id=user.id, email=user.email, phone="3001234567", role="customer"))
    db.commit()

    # Act
    messages = assign_role(db, user.email, "admin")

    # Assert
    assert "WhatsApp de la tienda: 573001234567" in messages
    assert client.get("/api/v1/settings").json()["whatsapp_number"] == "573001234567"


def test_second_admin_does_not_overwrite_existing_whatsapp(client, db):
    first, second = new_user(), new_user()
    db.add_all([
        Profile(id=first.id, email=first.email, phone="3001234567", role="customer"),
        Profile(id=second.id, email=second.email, phone="3209998877", role="customer"),
    ])
    db.commit()

    assign_role(db, first.email, "admin")
    assign_role(db, second.email, "admin")

    assert client.get("/api/v1/settings").json()["whatsapp_number"] == "573001234567"


def test_explicit_whatsapp_flag_replaces_number(client, db):
    user = new_user()
    db.add(Profile(id=user.id, email=user.email, phone="3001234567", role="customer"))
    db.commit()

    assign_role(db, user.email, "admin", whatsapp="+57 315 000 1111")

    assert client.get("/api/v1/settings").json()["whatsapp_number"] == "573150001111"


def test_content_cover_is_public_but_media_stays_locked(client, db):
    db.add(ContentItem(kind="meal", title="Cena del día", access="plus", cover_url="https://x.supabase.co/c.jpg",
                       media_url="https://x.supabase.co/v.mp4"))
    db.commit()

    item = client.get("/api/v1/content", params={"kind": "meal"}).json()[0]

    assert item["locked"] is True
    assert item["cover_url"] == "https://x.supabase.co/c.jpg"
    assert item["media_url"] is None


def test_admin_can_set_content_cover(client, db):
    admin = create_admin(db)
    created = client.post("/api/v1/admin/content", headers=admin.headers, json={
        "kind": "routine", "title": "Piernas", "cover_url": "https://x.supabase.co/p.jpg",
        "media_url": "https://www.youtube.com/watch?v=abc123",
    })
    assert created.status_code == 201
    assert created.json()["cover_url"] == "https://x.supabase.co/p.jpg"


def test_content_upload_requires_storage_configuration(client, db):
    admin = create_admin(db)
    response = client.post("/api/v1/admin/uploads/content-media", headers=admin.headers,
                           files={"file": ("clip.mp4", b"0000", "video/mp4")})
    assert response.status_code == 503


def test_content_upload_accepts_video_and_rejects_other_types(client, db, monkeypatch):
    # Arrange: almacenamiento configurado y subida simulada.
    admin = create_admin(db)
    monkeypatch.setattr(get_settings(), "supabase_service_role_key", "service-key-de-prueba")
    uploaded = []
    monkeypatch.setattr(storage, "_upload", lambda content, ctype, folder, ext: uploaded.append(folder) or f"https://cdn/{folder}/a.{ext}")

    # Act
    video = client.post("/api/v1/admin/uploads/content-media", headers=admin.headers,
                        files={"file": ("clip.mp4", b"0000", "video/mp4")})
    pdf = client.post("/api/v1/admin/uploads/content-media", headers=admin.headers,
                      files={"file": ("doc.pdf", b"%PDF", "application/pdf")})

    # Assert
    assert video.status_code == 200
    assert video.json() == {"url": "https://cdn/content/videos/a.mp4", "media_type": "video"}
    assert pdf.status_code == 422
    assert uploaded == ["content/videos"]


def test_customers_cannot_upload(client):
    customer = new_user()
    response = client.post("/api/v1/admin/uploads/content-media", headers=customer.headers,
                           files={"file": ("clip.mp4", b"0000", "video/mp4")})
    assert response.status_code == 403
