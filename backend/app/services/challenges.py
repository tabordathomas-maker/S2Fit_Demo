"""Retos y recompensas.

- Porcentaje de hábitos: cumplimiento de los últimos 7 días (desbloquea descuentos).
- Porcentaje de retos: retos completados sobre los retos disponibles para la persona.
"""

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.errors import AppError, conflict, not_found
from app.models import Challenge, ChallengeParticipation, Profile, Reward, RewardRedemption
from app.models.enums import AccessLevel, RedemptionStatus, RewardKind
from app.services import habits
from app.services.subscriptions import has_active_membership


def _plus_required() -> AppError:
    return AppError(403, "plus_required", "Este reto es exclusivo para miembros activos de S2 Plus.")


def _active_challenges(db: Session) -> list[Challenge]:
    return list(db.scalars(select(Challenge).where(Challenge.is_active.is_(True)).order_by(Challenge.sort_order, Challenge.id)))


def _participations(db: Session, user: Profile | None) -> dict[int, ChallengeParticipation]:
    if user is None:
        return {}
    rows = db.scalars(select(ChallengeParticipation).where(ChallengeParticipation.user_id == user.id))
    return {p.challenge_id: p for p in rows}


def _challenge_percent(challenges: list[Challenge], parts: dict[int, ChallengeParticipation], member: bool) -> int:
    available = [c for c in challenges if c.access == AccessLevel.free or member]
    if not available:
        return 0
    completed = sum(1 for c in available if (p := parts.get(c.id)) and p.completed_at is not None)
    return round(completed * 100 / len(available))


def list_challenges(db: Session, user: Profile | None, today: date, now: datetime) -> dict:
    member = has_active_membership(db, user.id if user else None, now)
    challenges = _active_challenges(db)
    parts = _participations(db, user)
    items = []
    for c in challenges:
        p = parts.get(c.id)
        locked = c.access == AccessLevel.plus and not member
        completed = p is not None and p.completed_at is not None
        items.append({
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "access": c.access,
            "target_count": c.target_count,
            "locked": locked,
            "joined": p is not None,
            "progress": p.progress if p else 0,
            "completed": completed,
            "can_progress_today": p is not None and not locked and not completed and p.last_progress_on != today,
        })
    return {"challenge_percent": _challenge_percent(challenges, parts, member), "challenges": items}


def _get_active_challenge(db: Session, challenge_id: int) -> Challenge:
    challenge = db.get(Challenge, challenge_id)
    if challenge is None or not challenge.is_active:
        raise not_found("El reto no existe.")
    return challenge


def join(db: Session, user: Profile, challenge_id: int, now: datetime) -> None:
    challenge = _get_active_challenge(db, challenge_id)
    if challenge.access == AccessLevel.plus and not has_active_membership(db, user.id, now):
        raise _plus_required()
    db.execute(
        insert(ChallengeParticipation)
        .values(challenge_id=challenge.id, user_id=user.id, progress=0)
        .on_conflict_do_nothing(constraint="uq_challenge_participations_challenge_user")
    )


def progress(db: Session, user: Profile, challenge_id: int, today: date, now: datetime) -> ChallengeParticipation:
    challenge = _get_active_challenge(db, challenge_id)
    if challenge.access == AccessLevel.plus and not has_active_membership(db, user.id, now):
        raise _plus_required()
    part = db.scalars(
        select(ChallengeParticipation)
        .where(ChallengeParticipation.challenge_id == challenge.id, ChallengeParticipation.user_id == user.id)
        .with_for_update()
    ).one_or_none()
    if part is None:
        raise conflict("not_joined", "Primero únete al reto.")
    if part.completed_at is not None:
        raise conflict("challenge_completed", "Ya completaste este reto.")
    if part.last_progress_on == today:
        raise conflict("already_progressed_today", "Ya registraste tu avance de hoy. ¡Vuelve mañana!")
    part.progress += 1
    part.last_progress_on = today
    if part.progress >= challenge.target_count:
        part.completed_at = now
    return part


def rewards_summary(db: Session, user: Profile, today: date, now: datetime) -> dict:
    member = has_active_membership(db, user.id, now)
    habit_pct = habits.weekly_percent(db, user, today)
    challenge_pct = _challenge_percent(_active_challenges(db), _participations(db, user), member)
    redemptions = {
        r.reward_id: r.status
        for r in db.scalars(select(RewardRedemption).where(RewardRedemption.user_id == user.id))
    }
    rewards = db.scalars(select(Reward).where(Reward.is_active.is_(True)).order_by(Reward.kind, Reward.threshold_pct))
    items = []
    for r in rewards:
        items.append({
            "id": r.id,
            "kind": r.kind,
            "name": r.name,
            "description": r.description,
            "threshold_pct": r.threshold_pct,
            "access": r.access,
            "unlocked": _is_unlocked(r, habit_pct, challenge_pct, member),
            "redemption_status": redemptions.get(r.id),
        })
    return {"habit_percent": habit_pct, "challenge_percent": challenge_pct, "rewards": items}


def _is_unlocked(reward: Reward, habit_pct: int, challenge_pct: int, member: bool) -> bool:
    if reward.access == AccessLevel.plus and not member:
        return False
    pct = habit_pct if reward.kind == RewardKind.habit_discount else challenge_pct
    return pct >= reward.threshold_pct


def redeem(db: Session, user: Profile, reward_id: int, today: date, now: datetime) -> RewardRedemption:
    reward = db.get(Reward, reward_id)
    if reward is None or not reward.is_active:
        raise not_found("La recompensa no existe.")
    summary = rewards_summary(db, user, today, now)
    if not next(r["unlocked"] for r in summary["rewards"] if r["id"] == reward.id):
        raise conflict("reward_locked", "Aún no has desbloqueado esta recompensa.")
    existing = db.scalars(
        select(RewardRedemption).where(RewardRedemption.reward_id == reward.id, RewardRedemption.user_id == user.id)
        .with_for_update()
    ).one_or_none()
    if existing is not None:
        if existing.status != RedemptionStatus.cancelled:
            raise conflict("already_requested", "Ya solicitaste esta recompensa.")
        existing.status = RedemptionStatus.requested
        return existing
    redemption = RewardRedemption(reward_id=reward.id, user_id=user.id, status=RedemptionStatus.requested)
    db.add(redemption)
    db.flush()
    return redemption
