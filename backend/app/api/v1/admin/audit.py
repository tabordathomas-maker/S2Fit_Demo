"""Auditoría en tarjetas: por cliente y por evento."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import AdminUser, DbSession
from app.services import audit_views

router = APIRouter(tags=["admin: auditoría"])

DateFrom = Annotated[date | None, Query(alias="from")]
DateTo = Annotated[date | None, Query(alias="to")]
Q = Annotated[str | None, Query(max_length=80)]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


@router.get("/audit/clients")
def audit_clients(_: AdminUser, db: DbSession, date_from: DateFrom = None, date_to: DateTo = None, q: Q = None, limit: Limit = 20, offset: Offset = 0):
    return audit_views.list_clients(db, date_from, date_to, q, limit, offset)


@router.get("/audit-logs")
def audit_logs(
    _: AdminUser, db: DbSession, category: Annotated[str | None, Query(max_length=40)] = None,
    date_from: DateFrom = None, date_to: DateTo = None, q: Q = None, limit: Limit = 20, offset: Offset = 0,
):
    return audit_views.list_events(db, category, date_from, date_to, q, limit, offset)
