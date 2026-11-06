from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession, rate_limited
from app.core import clock
from app.schemas.box_claims import BoxClaimCreate, BoxClaimOut
from app.schemas.box_images import BoxImageOut
from app.services import box_claims, box_images

router = APIRouter(prefix="/s2box", tags=["S2 Box"])


@router.get("/images", response_model=list[BoxImageOut])
def list_images(db: DbSession):
    """Galería pública: solo las imágenes activas, por orden."""
    return box_images.list_public(db)


@router.post("/claims", response_model=BoxClaimOut, status_code=status.HTTP_201_CREATED,
             dependencies=[rate_limited("box_claims")])
def create_claim(data: BoxClaimCreate, user: CurrentUser, db: DbSession):
    claim = box_claims.create(db, user, data.customer_note, clock.now())
    db.commit()
    return claim


@router.get("/claims/me", response_model=list[BoxClaimOut])
def my_claims(user: CurrentUser, db: DbSession):
    return box_claims.list_for_user(db, user)
