from typing import Annotated

from fastapi import APIRouter, File, UploadFile, status

from app.api.deps import AdminUser, DbSession
from app.schemas.admin import UploadResult
from app.schemas.box_images import AdminBoxImageOut, BoxImageCreate, BoxImageUpdate
from app.services import audit, box_images, storage

router = APIRouter(tags=["admin: S2 Box"])


@router.get("/s2box/images", response_model=list[AdminBoxImageOut])
def list_images(_: AdminUser, db: DbSession):
    return box_images.list_all(db)


@router.post("/s2box/images", response_model=AdminBoxImageOut, status_code=status.HTTP_201_CREATED)
def create_image(data: BoxImageCreate, admin: AdminUser, db: DbSession):
    image = box_images.create_image(db, admin, data)
    db.commit()
    return image


@router.patch("/s2box/images/{image_id}", response_model=AdminBoxImageOut)
def update_image(image_id: int, data: BoxImageUpdate, admin: AdminUser, db: DbSession):
    image = box_images.update_image(db, admin, image_id, data)
    db.commit()
    return image


@router.delete("/s2box/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(image_id: int, admin: AdminUser, db: DbSession):
    box_images.delete_image(db, admin, image_id)
    db.commit()


@router.post("/uploads/s2box-image", response_model=UploadResult)
def upload_image(admin: AdminUser, db: DbSession, file: Annotated[UploadFile, File()]):
    """Sube una imagen a la carpeta s2box/ del bucket; después se registra con POST /s2box/images."""
    content = file.file.read(storage.MAX_IMAGE_BYTES + 1)
    url = storage.upload_box_image(content, file.content_type or "")
    audit.record(db, admin, "upload.box_image", "storage", storage.object_key(url), {"filename": file.filename})
    db.commit()
    return {"url": url}
