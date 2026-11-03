import uuid
from datetime import datetime, timedelta

from sqlalchemy import exists, select
from sqlalchemy.orm import Session, selectinload

from app.core import clock
from app.core.errors import conflict, not_found
from app.core.references import new_reference
from app.models import Payment, Plan, Profile, Subscription, SubscriptionRenewal, SubscriptionRequest
from app.models.enums import (
    PaymentKind,
    PaymentStatus,
    SubscriptionRequestKind,
    SubscriptionRequestStatus,
    SubscriptionStatus,
)
from app.schemas.subscriptions import AgreedTerms
from app.services import audit

OPEN_PAYMENT_STATUSES = {PaymentStatus.pending, PaymentStatus.in_review}


def has_active_membership(db: Session, user_id: uuid.UUID | None, now: datetime) -> bool:
    """Única regla de acceso a S2 Plus: suscripción activa y con vencimiento futuro."""
    if user_id is None:
        return False
    return bool(
        db.scalar(
            select(
                exists().where(
                    Subscription.user_id == user_id,
                    Subscription.status == SubscriptionStatus.active,
                    Subscription.ends_at > now,
                )
            )
        )
    )


def _subscription_query():
    return select(Subscription).options(selectinload(Subscription.plan), selectinload(Subscription.renewals))


def refresh_status(sub: Subscription | None, now: datetime) -> None:
    """Marca como vencida una suscripción activa cuya fecha de fin ya pasó."""
    if sub is not None and sub.status == SubscriptionStatus.active and sub.ends_at is not None and sub.ends_at <= now:
        sub.status = SubscriptionStatus.expired


def expire_overdue(db: Session, now: datetime) -> int:
    subs = db.scalars(
        select(Subscription).where(Subscription.status == SubscriptionStatus.active, Subscription.ends_at <= now)
    ).all()
    for sub in subs:
        sub.status = SubscriptionStatus.expired
    return len(subs)


def get_user_subscription(db: Session, user_id: uuid.UUID, lock: bool = False) -> Subscription | None:
    stmt = _subscription_query().where(Subscription.user_id == user_id)
    if lock:
        stmt = stmt.with_for_update(of=Subscription).execution_options(populate_existing=True)
    return db.scalars(stmt).one_or_none()


def get_pending_request(db: Session, user_id: uuid.UUID) -> SubscriptionRequest | None:
    return db.scalars(
        select(SubscriptionRequest)
        .options(selectinload(SubscriptionRequest.plan))
        .where(
            SubscriptionRequest.user_id == user_id,
            SubscriptionRequest.status == SubscriptionRequestStatus.pending_payment,
        )
        .order_by(SubscriptionRequest.created_at.desc())
    ).first()


def create_request(db: Session, user: Profile, plan_code: str) -> tuple[SubscriptionRequest, bool]:
    """Crea la solicitud (y su pago pendiente) antes de abrir WhatsApp.

    Si ya hay una solicitud pendiente para el mismo plan se reutiliza, para no
    generar referencias duplicadas cuando la persona pulsa el botón varias veces.
    """
    plan = db.scalars(select(Plan).where(Plan.code == plan_code, Plan.is_active.is_(True))).one_or_none()
    if plan is None:
        raise not_found("El plan seleccionado no existe o no está disponible.")

    # Bloquear la suscripción serializa las solicitudes simultáneas de la misma persona.
    sub = get_user_subscription(db, user.id, lock=True)
    pending = get_pending_request(db, user.id)
    if pending is not None:
        if pending.plan_id == plan.id:
            return pending, True
        _cancel_request(db, pending)

    kind = SubscriptionRequestKind.renewal if sub is not None and sub.starts_at is not None else SubscriptionRequestKind.new
    if sub is None:
        db.add(Subscription(user_id=user.id, plan_id=plan.id, status=SubscriptionStatus.pending_payment))

    request = SubscriptionRequest(
        reference=new_reference("SUB"),
        user_id=user.id,
        plan_id=plan.id,
        kind=kind,
        status=SubscriptionRequestStatus.pending_payment,
    )
    db.add(request)
    db.flush()
    db.add(Payment(kind=PaymentKind.subscription, subscription_request_id=request.id, user_id=user.id,
                   status=PaymentStatus.pending))
    db.flush()
    db.refresh(request)
    return request, False


def _cancel_request(db: Session, request: SubscriptionRequest) -> None:
    request.status = SubscriptionRequestStatus.cancelled
    payment = db.scalars(
        select(Payment).where(Payment.subscription_request_id == request.id).with_for_update()
    ).one_or_none()
    if payment is not None and payment.status in OPEN_PAYMENT_STATUSES:
        payment.status = PaymentStatus.cancelled


def lock_request(db: Session, request_id: uuid.UUID) -> SubscriptionRequest:
    request = db.scalars(
        select(SubscriptionRequest)
        .options(selectinload(SubscriptionRequest.plan))
        .where(SubscriptionRequest.id == request_id)
        .with_for_update(of=SubscriptionRequest)
        .execution_options(populate_existing=True)
    ).one_or_none()
    if request is None:
        raise not_found("La solicitud de suscripción no existe.")
    return request


def set_agreed_terms(db: Session, request_id: uuid.UUID, admin: Profile, terms: AgreedTerms) -> SubscriptionRequest:
    request = lock_request(db, request_id)
    if request.status != SubscriptionRequestStatus.pending_payment:
        raise conflict("request_not_pending", "Solo se pueden modificar solicitudes pendientes de pago.")
    payment = db.scalars(
        select(Payment).where(Payment.subscription_request_id == request.id).with_for_update()
    ).one()
    if payment.status not in OPEN_PAYMENT_STATUSES:
        raise conflict("payment_already_processed", "El pago de esta solicitud ya fue procesado.")
    request.agreed_price = terms.agreed_price
    request.agreed_duration_days = terms.agreed_duration_days
    payment.amount = terms.agreed_price
    audit.record(db, admin, "subscription_request.set_terms", "subscription_request", request.id,
                 {"reference": request.reference, **terms.model_dump()})
    return request


def apply_confirmed_payment(db: Session, request: SubscriptionRequest, payment: Payment, admin: Profile,
                            now: datetime) -> Subscription:
    """Activa o renueva la membresía a partir de un pago confirmado (llamado dentro de la transacción)."""
    sub = get_user_subscription(db, request.user_id, lock=True)
    if sub is None:
        sub = Subscription(user_id=request.user_id, plan_id=request.plan_id, status=SubscriptionStatus.pending_payment)
        db.add(sub)
        db.flush()

    duration = request.agreed_duration_days or request.plan.duration_days
    if sub.status == SubscriptionStatus.active and sub.ends_at is not None and sub.ends_at > now:
        # Renovación anticipada: el nuevo periodo empieza cuando termina el actual.
        period_start = sub.ends_at
    else:
        period_start = now
        sub.starts_at = now
    period_end = period_start + timedelta(days=duration)

    sub.status = SubscriptionStatus.active
    sub.ends_at = period_end
    sub.plan_id = request.plan_id
    sub.amount_paid = payment.amount
    sub.last_payment_reference = payment.external_reference
    sub.cancelled_at = None
    if sub.origin_request_id is None or request.kind == SubscriptionRequestKind.new:
        sub.origin_request_id = request.id

    db.add(
        SubscriptionRenewal(
            subscription_id=sub.id,
            request_id=request.id,
            payment_id=payment.id,
            plan_id=request.plan_id,
            period_start=period_start,
            period_end=period_end,
            duration_days=duration,
            amount=payment.amount,
            confirmed_by=admin.id,
        )
    )
    request.status = SubscriptionRequestStatus.paid
    return sub


def cancel_subscription(db: Session, subscription_id: uuid.UUID, admin: Profile, reason: str, now: datetime) -> Subscription:
    sub = db.scalars(
        _subscription_query().where(Subscription.id == subscription_id).with_for_update(of=Subscription)
    ).one_or_none()
    if sub is None:
        raise not_found("La suscripción no existe.")
    if sub.status == SubscriptionStatus.cancelled:
        raise conflict("already_cancelled", "La suscripción ya está cancelada.")
    previous = sub.status
    sub.status = SubscriptionStatus.cancelled
    sub.cancelled_at = now
    audit.record(db, admin, "subscription.cancel", "subscription", sub.id,
                 {"previous_status": previous, "reason": reason, "user_id": str(sub.user_id)})
    return sub


MANUAL_REFERENCE = "MANUAL-ADMIN"


def grant_membership(db: Session, user: Profile, days: int, admin: Profile | None, reason: str) -> Subscription:
    """Activa o extiende S2 Plus a mano (cortesías, pruebas, pagos en efectivo). No crea pagos ni renovaciones.

    Con `admin=None` (scripts de terminal) no se audita, porque el registro exige un administrador.
    """
    plan = db.scalars(select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.sort_order, Plan.id)).first()
    if plan is None:
        raise conflict("plans_missing", "Primero crea un plan en Admin → S2 Plus.")

    now = clock.now()
    sub = get_user_subscription(db, user.id, lock=True)
    if sub is None:
        sub = Subscription(user_id=user.id, plan_id=plan.id)
        db.add(sub)

    current = sub.status == SubscriptionStatus.active and sub.ends_at is not None and sub.ends_at > now
    start = sub.ends_at if current else now
    if not current:
        sub.starts_at = now
    sub.plan_id = plan.id
    sub.status = SubscriptionStatus.active
    sub.ends_at = start + timedelta(days=days)
    sub.cancelled_at = None
    sub.last_payment_reference = MANUAL_REFERENCE
    db.flush()
    if admin is not None:
        audit.record(db, admin, "membership.grant", "subscription", sub.id,
                     {"days": days, "reason": reason, "ends_at": sub.ends_at.isoformat(), "user_id": str(user.id)})
    return sub


def cancel_membership(db: Session, user: Profile, admin: Profile | None, reason: str) -> Subscription:
    now = clock.now()
    sub = get_user_subscription(db, user.id, lock=True)
    if sub is None or sub.status != SubscriptionStatus.active or sub.ends_at is None or sub.ends_at <= now:
        raise conflict("no_active_membership", "Esta persona no tiene S2 Plus activa.")
    sub.status = SubscriptionStatus.cancelled
    sub.cancelled_at = now
    if admin is not None:
        audit.record(db, admin, "membership.cancel", "subscription", sub.id,
                     {"reason": reason, "ends_at": sub.ends_at.isoformat(), "user_id": str(user.id)})
    return sub
