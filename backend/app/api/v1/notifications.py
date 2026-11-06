from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core import clock
from app.schemas.notifications import NotificationFeed
from app.services import notifications

router = APIRouter(prefix="/notifications", tags=["notificaciones"])


@router.get("", response_model=NotificationFeed)
def get_feed(user: CurrentUser, db: DbSession):
    return notifications.feed_for(db, user, clock.now())


@router.post("/seen", response_model=NotificationFeed)
def mark_seen(user: CurrentUser, db: DbSession):
    now = clock.now()
    notifications.mark_seen(user, now)
    db.commit()
    return notifications.feed_for(db, user, now)
