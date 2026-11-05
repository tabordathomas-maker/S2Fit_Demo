from fastapi import APIRouter

from app.api.deps import DbSession
from app.schemas.box_images import BoxImageOut
from app.services import box_images

router = APIRouter(prefix="/s2box", tags=["S2 Box"])


@router.get("/images", response_model=list[BoxImageOut])
def list_images(db: DbSession):
    """Galería pública: solo las imágenes activas, por orden."""
    return box_images.list_public(db)
