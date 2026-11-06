"""Acceso a Mi Ruta: verificar un código (sin cuenta), consultar el acceso y canjear el código en la cuenta."""

from typing import Annotated

from fastapi import APIRouter, Header

from app.api.deps import CurrentUser, DbSession, OptionalUser, rate_limited_by_ip
from app.core import clock
from app.schemas.access_codes import AccessOut, CodeInput
from app.schemas.common import Message
from app.services import mi_ruta_access

router = APIRouter(prefix="/mi-ruta", tags=["mi ruta"])

# Freno a la fuerza bruta sobre códigos de 6 caracteres: pocas verificaciones por minuto y por IP.
VERIFY_LIMIT_PER_MINUTE = 10


@router.post("/codes/verify", response_model=Message, dependencies=[rate_limited_by_ip("mi_ruta_verify", VERIFY_LIMIT_PER_MINUTE)])
def verify_code(data: CodeInput, db: DbSession):
    mi_ruta_access.verify(db, data.code, clock.now())
    db.commit()
    return {"message": "Código válido."}


@router.get("/access", response_model=AccessOut)
def get_access(
    db: DbSession,
    user: OptionalUser,
    x_miruta_code: Annotated[str | None, Header(alias="X-MiRuta-Code", max_length=40)] = None,
):
    source = mi_ruta_access.access_source(db, user, x_miruta_code, clock.now())
    return {"has_access": source is not None, "source": source}


@router.post("/codes/redeem", response_model=AccessOut, dependencies=[rate_limited_by_ip("mi_ruta_redeem", VERIFY_LIMIT_PER_MINUTE)])
def redeem_code(data: CodeInput, user: CurrentUser, db: DbSession):
    mi_ruta_access.redeem(db, user, data.code, clock.now())
    db.commit()
    source = mi_ruta_access.access_source(db, user, None, clock.now())
    return {"has_access": source is not None, "source": source}
