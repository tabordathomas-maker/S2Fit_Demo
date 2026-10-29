from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.payments import PaymentOut
from app.schemas.profile import ProfileOut, ProfileUpdate
from app.services import payments

router = APIRouter(prefix="/me", tags=["mi cuenta"])


@router.get("", response_model=ProfileOut)
def get_me(user: CurrentUser):
    return user


@router.patch("", response_model=ProfileOut)
def update_me(data: ProfileUpdate, user: CurrentUser, db: DbSession):
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    return user


@router.get("/payments", response_model=list[PaymentOut])
def my_payments(user: CurrentUser, db: DbSession):
    return payments.list_user_payments(db, user)
