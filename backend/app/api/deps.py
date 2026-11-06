from typing import Annotated

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core import clock
from app.core.database import get_db
from app.core.errors import forbidden
from app.core.rate_limit import check_rate_limit
from app.core.security import decode_supabase_token, unauthorized
from app.models import Profile
from app.services import mi_ruta_access
from app.services.profiles import get_or_create_profile

bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def get_current_user(db: DbSession, credentials: Credentials) -> Profile:
    if credentials is None:
        raise unauthorized("Debes iniciar sesión para continuar.")
    claims = decode_supabase_token(credentials.credentials)
    return get_or_create_profile(db, claims)


def get_optional_user(db: DbSession, credentials: Credentials) -> Profile | None:
    # Sin cabecera: visitante. Con cabecera inválida: error, para no ocultar fallos de sesión.
    if credentials is None:
        return None
    return get_current_user(db, credentials)


def require_admin(user: Annotated[Profile, Depends(get_current_user)]) -> Profile:
    if not user.is_admin:
        raise forbidden("admin_required", "Esta sección es solo para administración.")
    return user


CurrentUser = Annotated[Profile, Depends(get_current_user)]
OptionalUser = Annotated[Profile | None, Depends(get_optional_user)]
AdminUser = Annotated[Profile, Depends(require_admin)]


def rate_limited(bucket: str):
    def dependency(user: CurrentUser) -> Profile:
        check_rate_limit(bucket, str(user.id))
        return user

    return Depends(dependency)


def client_ip(request: Request) -> str:
    """IP de la persona: Render la pone al inicio de X-Forwarded-For; sin ese header, la del socket."""
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    if first:
        return first
    return request.client.host if request.client else "unknown"


def rate_limited_by_ip(bucket: str, limit: int):
    """Como rate_limited, pero para visitantes sin cuenta: el límite es por IP."""

    def dependency(request: Request) -> None:
        check_rate_limit(bucket, client_ip(request), limit)

    return Depends(dependency)


def require_mi_ruta_access(
    db: DbSession,
    user: OptionalUser,
    x_miruta_code: Annotated[str | None, Header(alias="X-MiRuta-Code", max_length=40)] = None,
) -> Profile | None:
    if not mi_ruta_access.has_mi_ruta_access(db, user, x_miruta_code, clock.now()):
        raise forbidden("mi_ruta_locked", "Mi Ruta es para clientas S2. Ingresa tu código para entrar.")
    return user


MiRutaAccess = Annotated[Profile | None, Depends(require_mi_ruta_access)]
