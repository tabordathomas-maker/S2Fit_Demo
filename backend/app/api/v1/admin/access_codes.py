from typing import Annotated, Literal

from fastapi import APIRouter, Query, status

from app.api.deps import AdminUser, DbSession
from app.core import clock
from app.schemas.access_codes import AccessCodeCreate, AccessCodeOut, AccessCodeUpdate
from app.services import mi_ruta_access

router = APIRouter(tags=["admin: códigos de Mi Ruta"])


@router.get("/access-codes", response_model=list[AccessCodeOut])
def list_access_codes(
    _: AdminUser,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=80)] = None,
    status_filter: Annotated[Literal["active", "inactive", "expired"] | None, Query(alias="status")] = None,
):
    now = clock.now()
    return mi_ruta_access.present(db, mi_ruta_access.list_codes(db, q, status_filter, now), now)


@router.post("/access-codes", response_model=list[AccessCodeOut], status_code=status.HTTP_201_CREATED)
def create_access_codes(data: AccessCodeCreate, admin: AdminUser, db: DbSession):
    codes = mi_ruta_access.generate(db, admin, data)
    db.commit()
    return mi_ruta_access.present(db, codes, clock.now())


@router.patch("/access-codes/{code_id}", response_model=AccessCodeOut)
def update_access_code(code_id: int, data: AccessCodeUpdate, admin: AdminUser, db: DbSession):
    code = mi_ruta_access.update_code(db, admin, code_id, data)
    db.commit()
    return mi_ruta_access.present(db, [code], clock.now())[0]


@router.delete("/access-codes/{code_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_access_code(code_id: int, admin: AdminUser, db: DbSession):
    mi_ruta_access.delete_code(db, admin, code_id)
    db.commit()
