from fastapi import APIRouter, Response, status

from app.api.deps import CurrentUser, DbSession, OptionalUser, rate_limited
from app.core import clock
from app.schemas.box_claims import BoxClaimCreate, BoxClaimCreated, BoxClaimOut
from app.schemas.mystery_boxes import MysteryBoxContent, MysteryBoxPublic
from app.services import box_claims, mystery_boxes

router = APIRouter(prefix="/s2box", tags=["S2 Box"])


@router.get("/boxes", response_model=list[MysteryBoxPublic])
def list_boxes(db: DbSession):
    """Solo la portada de cada caja; el contenido sale por /boxes/{id}/content."""
    return mystery_boxes.list_public(db)


@router.get("/boxes/{box_id}/content", response_model=MysteryBoxContent)
def box_content(box_id: int, db: DbSession, user: OptionalUser):
    return mystery_boxes.get_content(db, box_id, user, clock.now())


@router.post("/boxes/{box_id}/claims", response_model=BoxClaimCreated, status_code=status.HTTP_201_CREATED,
             dependencies=[rate_limited("box_claims")])
def create_claim(box_id: int, data: BoxClaimCreate, user: CurrentUser, db: DbSession, response: Response):
    claim, existed = box_claims.create(db, user, box_id, data.customer_note, clock.now())
    db.commit()
    if existed:
        response.status_code = status.HTTP_200_OK
    return {
        **BoxClaimOut.model_validate(claim).model_dump(),
        "whatsapp_message": box_claims.whatsapp_message(claim, user),
        "already_existed": existed,
    }


@router.get("/claims/me", response_model=list[BoxClaimOut])
def my_claims(user: CurrentUser, db: DbSession):
    return box_claims.list_for_user(db, user)
