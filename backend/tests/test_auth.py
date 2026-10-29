"""Autenticación (verificación de JWT de Supabase), perfiles y autorización por rol."""

import uuid

import jwt
from cryptography.hazmat.primitives.asymmetric import ec

from app.core import security
from app.models import Profile
from tests.factories import ISSUER, create_admin, make_token, new_user


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_health_reports_database_ok(client):
    # Act
    response = client.get("/health")

    # Assert
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_first_request_registers_customer_profile(client, db):
    # Arrange
    user_id = uuid.uuid4()
    token = make_token(user_id, email="nueva@example.com", metadata={"full_name": "Laura", "phone": "+573001112233"})

    # Act
    response = client.get("/api/v1/me", headers=_bearer(token))

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "customer"
    assert body["full_name"] == "Laura"
    assert db.get(Profile, user_id).phone == "+573001112233"


def test_signup_metadata_cannot_grant_admin_role(client):
    # Arrange: la persona intenta registrarse con role=admin en sus metadatos.
    token = make_token(uuid.uuid4(), metadata={"role": "admin", "full_name": "Intrusa"})

    # Act
    me = client.get("/api/v1/me", headers=_bearer(token))
    admin_area = client.get("/api/v1/admin/payments", headers=_bearer(token))

    # Assert
    assert me.json()["role"] == "customer"
    assert admin_area.status_code == 403


def test_profile_update_rejects_role_field(client):
    # Arrange
    user = new_user()

    # Act
    response = client.patch("/api/v1/me", json={"full_name": "Ana", "role": "admin"}, headers=user.headers)

    # Assert
    assert response.status_code == 422
    assert client.get("/api/v1/me", headers=user.headers).json()["role"] == "customer"


def test_profile_update_changes_name_and_phone(client):
    # Arrange
    user = new_user()

    # Act
    response = client.patch("/api/v1/me", json={"full_name": "Ana Gómez", "phone": "+573009998877"}, headers=user.headers)

    # Assert
    assert response.status_code == 200
    assert response.json()["full_name"] == "Ana Gómez"


def test_missing_token_is_rejected(client):
    assert client.get("/api/v1/me").status_code == 401


def test_token_with_wrong_signature_is_rejected(client):
    token = make_token(uuid.uuid4(), secret="otro-secreto-que-no-es-el-de-supabase-123")
    assert client.get("/api/v1/me", headers=_bearer(token)).status_code == 401


def test_expired_token_is_rejected(client):
    token = make_token(uuid.uuid4(), expires_in=-120)
    assert client.get("/api/v1/me", headers=_bearer(token)).status_code == 401


def test_token_for_other_audience_is_rejected(client):
    token = make_token(uuid.uuid4(), audience="otra-app")
    assert client.get("/api/v1/me", headers=_bearer(token)).status_code == 401


def test_token_from_other_issuer_is_rejected(client):
    token = make_token(uuid.uuid4(), issuer="https://otro-proyecto.supabase.co/auth/v1")
    assert client.get("/api/v1/me", headers=_bearer(token)).status_code == 401


def test_anon_key_token_is_not_a_user_session(client):
    token = make_token(uuid.uuid4(), role="anon")
    assert client.get("/api/v1/me", headers=_bearer(token)).status_code == 401


def test_unsigned_token_is_rejected(client):
    token = jwt.encode({"sub": str(uuid.uuid4()), "aud": "authenticated", "role": "authenticated"}, None, algorithm="none")
    assert client.get("/api/v1/me", headers=_bearer(token)).status_code == 401


def test_asymmetric_es256_token_is_verified_with_jwks(client, monkeypatch):
    # Arrange: simula el JWKS de Supabase con una clave ES256 propia.
    private_key = ec.generate_private_key(ec.SECP256R1())

    class FakeJWKSClient:
        def get_signing_key_from_jwt(self, token):
            return type("Key", (), {"key": private_key.public_key()})()

    monkeypatch.setattr(security, "get_jwks_client", lambda: FakeJWKSClient())
    claims = {"sub": str(uuid.uuid4()), "aud": "authenticated", "iss": ISSUER, "role": "authenticated",
              "exp": 4102444800, "email": "es256@example.com"}
    good = jwt.encode(claims, private_key, algorithm="ES256")
    forged = jwt.encode(claims, ec.generate_private_key(ec.SECP256R1()), algorithm="ES256")

    # Act / Assert
    assert client.get("/api/v1/me", headers=_bearer(good)).status_code == 200
    assert client.get("/api/v1/me", headers=_bearer(forged)).status_code == 401


def test_customer_cannot_use_admin_endpoints(client):
    # Arrange
    customer = new_user()

    # Act
    responses = [
        client.get("/api/v1/admin/payments", headers=customer.headers),
        client.get("/api/v1/admin/orders", headers=customer.headers),
        client.post("/api/v1/admin/categories", json={"name": "X", "slug": "x"}, headers=customer.headers),
        client.get("/api/v1/admin/audit-logs", headers=customer.headers),
    ]

    # Assert
    assert [r.status_code for r in responses] == [403, 403, 403, 403]


def test_admin_can_use_admin_endpoints(client, db):
    # Arrange
    admin = create_admin(db)

    # Act
    response = client.get("/api/v1/admin/payments", headers=admin.headers)

    # Assert
    assert response.status_code == 200


def test_cors_allows_only_configured_origins(client):
    # Act
    allowed = client.get("/health", headers={"Origin": "https://s2fit.github.io"})
    blocked = client.get("/health", headers={"Origin": "https://sitio-malicioso.com"})

    # Assert
    assert allowed.headers.get("access-control-allow-origin") == "https://s2fit.github.io"
    assert "access-control-allow-origin" not in blocked.headers


def test_errors_do_not_leak_internal_details(client):
    # Act
    response = client.get("/api/v1/orders/S2-ORD-NOEXISTE", headers=new_user().headers)

    # Assert
    assert response.status_code == 404
    assert set(response.json()["error"]) == {"code", "message", "details"}
