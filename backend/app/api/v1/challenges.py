from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession, OptionalUser
from app.core import clock
from app.schemas.common import Message
from app.schemas.wellness import ChallengesSummary, RewardsSummary
from app.services import challenges

router = APIRouter(tags=["retos y recompensas"])


@router.get("/challenges", response_model=ChallengesSummary)
def list_challenges(db: DbSession, user: OptionalUser):
    return challenges.list_challenges(db, user, clock.local_today(), clock.now())


@router.post("/challenges/{challenge_id}/join", response_model=ChallengesSummary)
def join_challenge(challenge_id: int, user: CurrentUser, db: DbSession):
    challenges.join(db, user, challenge_id, clock.now())
    db.commit()
    return challenges.list_challenges(db, user, clock.local_today(), clock.now())


@router.post("/challenges/{challenge_id}/progress", response_model=ChallengesSummary)
def progress_challenge(challenge_id: int, user: CurrentUser, db: DbSession):
    challenges.progress(db, user, challenge_id, clock.local_today(), clock.now())
    db.commit()
    return challenges.list_challenges(db, user, clock.local_today(), clock.now())


@router.get("/rewards", response_model=RewardsSummary)
def list_rewards(user: CurrentUser, db: DbSession):
    return challenges.rewards_summary(db, user, clock.local_today(), clock.now())


@router.post("/rewards/{reward_id}/redeem", response_model=Message, status_code=status.HTTP_201_CREATED)
def redeem_reward(reward_id: int, user: CurrentUser, db: DbSession):
    challenges.redeem(db, user, reward_id, clock.local_today(), clock.now())
    db.commit()
    return {"message": "Solicitud registrada. Te contactaremos por WhatsApp para entregarte la recompensa."}
