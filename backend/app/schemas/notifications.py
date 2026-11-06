from datetime import datetime
from typing import Literal

from app.schemas.common import ORMModel

NotificationKind = Literal["order", "subscription", "box_claim", "mi_ruta"]
NotificationStatus = Literal["pending", "accepted", "rejected"]


class NotificationItem(ORMModel):
    id: str  # "order:S2-ORD-…", "subscription:S2-SUB-…", "box_claim:S2-BOX-…"
    kind: NotificationKind
    reference: str
    title: str
    status: NotificationStatus
    status_label: str
    occurred_at: datetime
    link: str
    unread: bool


class NotificationFeed(ORMModel):
    items: list[NotificationItem]
    unread_count: int
