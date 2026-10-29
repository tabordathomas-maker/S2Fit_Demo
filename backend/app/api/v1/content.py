from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession, OptionalUser
from app.core import clock
from app.models.enums import ContentKind
from app.schemas.content import ContentOut
from app.services import content

router = APIRouter(prefix="/content", tags=["contenido"])


@router.get("", response_model=list[ContentOut])
def list_content(db: DbSession, user: OptionalUser, kind: Annotated[ContentKind | None, Query()] = None):
    return content.list_content(db, kind, user, clock.now())


@router.get("/{item_id}", response_model=ContentOut)
def get_content(item_id: int, db: DbSession, user: OptionalUser):
    return content.get_content(db, item_id, user, clock.now())
