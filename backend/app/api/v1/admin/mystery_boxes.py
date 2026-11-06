"""Cajas misteriosas de S2 Box. Las subidas usan /admin/uploads/s2box-image y /admin/uploads/content-media."""

from typing import Annotated

from fastapi import APIRouter, File, Response, UploadFile, status

from app.api.deps import AdminUser, DbSession
from app.schemas.admin import UploadResult
from app.schemas.mystery_boxes import AdminMysteryBoxOut, MysteryBoxCreate, MysteryBoxUpdate
from app.services import audit, mystery_boxes, storage

router = APIRouter(tags=["admin: S2 Box"])


@router.get("/s2box/boxes", response_model=list[AdminMysteryBoxOut])
def list_boxes(_: AdminUser, db: DbSession):
    return mystery_boxes.list_all(db)


@router.post("/s2box/boxes", response_model=AdminMysteryBoxOut, status_code=status.HTTP_201_CREATED)
def create_box(data: MysteryBoxCreate, admin: AdminUser, db: DbSession):
    box = mystery_boxes.create_box(db, admin, data)
    db.commit()
    return box


@router.patch("/s2box/boxes/{box_id}", response_model=AdminMysteryBoxOut)
def update_box(box_id: int, data: MysteryBoxUpdate, admin: AdminUser, db: DbSession):
    box = mystery_boxes.update_box(db, admin, box_id, data)
    db.commit()
    return box


@router.delete("/s2box/boxes/{box_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_box(box_id: int, admin: AdminUser, db: DbSession):
    mystery_boxes.delete_box(db, admin, box_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/uploads/s2box-image", response_model=UploadResult)
def upload_image(admin: AdminUser, db: DbSession, file: Annotated[UploadFile, File()]):
    """Sube la portada de una caja a la carpeta s2box/ del bucket; la URL se guarda al crear o editar la caja."""
    content = file.file.read(storage.MAX_IMAGE_BYTES + 1)
    url = storage.upload_box_image(content, file.content_type or "")
    audit.record(db, admin, "upload.box_image", "storage", storage.object_key(url), {"filename": file.filename})
    db.commit()
    return {"url": url}
