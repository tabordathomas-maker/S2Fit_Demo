"""Verificación criptográfica de los JWT emitidos por Supabase Auth.

Supabase firma los tokens con claves asimétricas (ES256/RS256, publicadas en JWKS)
o, en proyectos antiguos, con un secreto compartido HS256. Se aceptan ambos, pero
solo con el algoritmo que corresponde a cada clave configurada.
"""

from functools import lru_cache
from typing import Any

import jwt
from jwt import PyJWKClient

from app.core.config import get_settings
from app.core.errors import AppError

ASYMMETRIC_ALGORITHMS = {"ES256", "RS256"}


def unauthorized(message: str = "Sesión inválida o expirada. Inicia sesión de nuevo.") -> AppError:
    return AppError(401, "unauthorized", message)


@lru_cache
def get_jwks_client() -> PyJWKClient | None:
    settings = get_settings()
    if not settings.supabase_url:
        return None
    return PyJWKClient(f"{settings.supabase_issuer}/.well-known/jwks.json", cache_keys=True, lifespan=600)


def decode_supabase_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise unauthorized() from exc

    algorithm = header.get("alg")
    if algorithm == "HS256" and settings.supabase_jwt_secret:
        key: Any = settings.supabase_jwt_secret
    elif algorithm in ASYMMETRIC_ALGORITHMS and (client := get_jwks_client()) is not None:
        try:
            key = client.get_signing_key_from_jwt(token).key
        except jwt.PyJWTError as exc:
            raise unauthorized() from exc
    else:
        raise unauthorized()

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[algorithm],
            audience=settings.supabase_jwt_audience,
            issuer=settings.supabase_issuer,
            options={"require": ["exp", "sub", "aud"]},
            leeway=10,
        )
    except jwt.PyJWTError as exc:
        raise unauthorized() from exc

    # Los tokens "anon" o de servicio no representan a un usuario final.
    if claims.get("role") != "authenticated":
        raise unauthorized()
    return claims
