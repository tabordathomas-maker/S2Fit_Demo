"""Registro de auditoría de acciones administrativas."""

from tests.factories import create_admin, create_variant, new_user


def test_admin_actions_are_recorded_and_listed(client, db):
    # Arrange
    admin = create_admin(db)
    variant = create_variant(db, stock=1)

    # Act
    client.post(f"/api/v1/admin/variants/{variant.id}/stock", json={"delta": 4, "note": "Llegó mercancía"},
                headers=admin.headers)
    client.post("/api/v1/admin/plans", json={"code": "plus-anual", "name": "S2 Plus anual", "duration_days": 365},
                headers=admin.headers)
    logs = client.get("/api/v1/admin/audit-logs", headers=admin.headers).json()

    # Assert
    assert [log["action"] for log in logs] == ["plan.create", "variant.stock_adjust"]
    assert logs[1]["details"]["delta"] == 4
    assert logs[1]["admin_email"] == admin.email


def test_failed_admin_action_leaves_no_audit_entry(client, db):
    # Arrange
    admin = create_admin(db)
    variant = create_variant(db, stock=1)

    # Act
    response = client.post(f"/api/v1/admin/variants/{variant.id}/stock", json={"delta": -5, "note": "Error"},
                           headers=admin.headers)
    logs = client.get("/api/v1/admin/audit-logs", headers=admin.headers).json()

    # Assert
    assert response.status_code == 409
    assert logs == []


def test_customers_cannot_read_audit_logs(client):
    assert client.get("/api/v1/admin/audit-logs", headers=new_user().headers).status_code == 403


def test_upload_without_storage_configuration_fails_cleanly(client, db):
    admin = create_admin(db)
    response = client.post("/api/v1/admin/uploads/product-image", headers=admin.headers,
                           files={"file": ("foto.png", b"\x89PNG....", "image/png")})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "storage_not_configured"
