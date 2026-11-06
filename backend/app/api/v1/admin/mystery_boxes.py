"""Cajas misteriosas de S2 Box. Las subidas usan /admin/uploads/s2box-image y /admin/uploads/content-media."""

from fastapi import APIRouter, Response, status

from app.api.deps import AdminUser, DbSession
from app.schemas.mystery_boxes import AdminMysteryBoxOut, MysteryBoxCreate, MysteryBoxUpdate
from app.services import mystery_boxes

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
