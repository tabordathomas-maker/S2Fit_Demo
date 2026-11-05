"""Eliminación de contenidos, retos y recompensas desde el panel."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.models import Challenge, ChallengeParticipation, ContentItem, Profile, Reward, RewardRedemption
from app.services import archive, audit


def delete_content(db: Session, admin: Profile, item_id: int) -> None:
    item = db.get(ContentItem, item_id)
    if item is None:
        raise not_found()
    # Nada referencia al contenido (los hábitos y el progreso son de cada persona), así que siempre se puede borrar.
    # TODO: borrar también portada y video del bucket cuando exista un helper storage.delete (no bloquea el borrado).
    audit.record(db, admin, "content.delete", "content", item.id, {"title": item.title, "kind": item.kind})
    db.delete(item)


def delete_challenge(db: Session, admin: Profile, challenge_id: int) -> None:
    challenge = db.get(Challenge, challenge_id)
    if challenge is None:
        raise not_found()
    participants = db.scalar(
        select(func.count(ChallengeParticipation.id)).where(ChallengeParticipation.challenge_id == challenge.id)
    ) or 0
    with_progress = db.scalar(
        select(func.count(ChallengeParticipation.id)).where(
            ChallengeParticipation.challenge_id == challenge.id, ChallengeParticipation.progress > 0
        )
    ) or 0
    archive.block_if_referenced(
        f"Este reto tiene {archive.plural(participants, 'participante', 'participantes')} con su progreso. "
        "Puedes archivarlo para que deje de ofrecerse.",
        {"participants": participants, "with_progress": with_progress},
    )
    audit.record(db, admin, "challenge.delete", "challenge", challenge.id, {"title": challenge.title})
    db.delete(challenge)


def delete_reward(db: Session, admin: Profile, reward_id: int) -> None:
    reward = db.get(Reward, reward_id)
    if reward is None:
        raise not_found()
    redemptions = db.scalar(select(func.count(RewardRedemption.id)).where(RewardRedemption.reward_id == reward.id)) or 0
    archive.block_if_referenced(
        f"Esta recompensa tiene {archive.plural(redemptions, 'solicitud', 'solicitudes')} de canje. "
        "Puedes archivarla para que deje de ofrecerse.",
        {"redemptions": redemptions},
    )
    audit.record(db, admin, "reward.delete", "reward", reward.id, {"name": reward.name})
    db.delete(reward)
