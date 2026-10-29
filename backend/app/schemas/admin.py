import uuid
from datetime import datetime

from app.schemas.common import ORMModel


class AuditLogOut(ORMModel):
    id: int
    admin_id: uuid.UUID
    admin_email: str | None
    action: str
    entity_type: str
    entity_id: str
    details: dict
    created_at: datetime


class ExpiredSweepResult(ORMModel):
    expired_orders: int


class UploadResult(ORMModel):
    url: str
