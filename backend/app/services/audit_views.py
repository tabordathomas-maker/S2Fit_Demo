"""Vistas de la auditoría para el panel: por cliente y por evento (consultas agrupadas, sin N+1)."""

import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import Text, cast, func, or_, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import get_settings
from app.models import AdminAuditLog, Order, Payment, Plan, Profile, Subscription, SubscriptionRequest
from app.services import audit_presenter as presenter

CLIENT_ENTITIES = ("payment", "order", "subscription_request", "subscription")


def period_bounds(date_from: date | None, date_to: date | None) -> tuple[datetime | None, datetime | None]:
    """Días completos en hora de Colombia: un evento a las 11:30 p. m. cuenta en ese día."""
    tz = ZoneInfo(get_settings().app_timezone)
    start = datetime.combine(date_from, time.min, tz) if date_from else None
    end = datetime.combine(date_to + timedelta(days=1), time.min, tz) if date_to else None
    return start, end


def _period(stmt, start, end):
    if start:
        stmt = stmt.where(AdminAuditLog.created_at >= start)
    if end:
        stmt = stmt.where(AdminAuditLog.created_at < end)
    return stmt


def list_events(db: Session, category: str | None, date_from: date | None, date_to: date | None, q: str | None,
                limit: int, offset: int) -> dict:
    start, end = period_bounds(date_from, date_to)
    stmt = _period(select(AdminAuditLog), start, end)
    if category:
        types = [t for t, c in presenter.ENTITY_CATEGORY.items() if c == category]
        stmt = stmt.where(AdminAuditLog.entity_type.in_(types))
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(AdminAuditLog.action.ilike(pattern), cast(AdminAuditLog.details, Text).ilike(pattern)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    logs = list(db.scalars(stmt.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc()).limit(limit).offset(offset)))
    return {"total": total, "events": presenter.present(db, logs)}


def _uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def _client_of_entities(db: Session, rows: list[tuple[int, str, str, datetime]]) -> dict[int, uuid.UUID]:
    """event_id -> cliente, resolviendo el dueño de cada pago, pedido, solicitud o suscripción en 4 consultas."""
    by_type: dict[str, set[uuid.UUID]] = defaultdict(set)
    for _, entity_type, entity_id, _ in rows:
        if (parsed := _uuid(entity_id)) is not None:
            by_type[entity_type].add(parsed)
    owners: dict[tuple[str, uuid.UUID], uuid.UUID] = {}
    for type_, model in (("order", Order), ("payment", Payment), ("subscription_request", SubscriptionRequest), ("subscription", Subscription)):
        if by_type.get(type_):
            for entity_id, user_id in db.execute(select(model.id, model.user_id).where(model.id.in_(by_type[type_]))):
                owners[(type_, entity_id)] = user_id
    result = {}
    for event_id, entity_type, entity_id, _ in rows:
        parsed = _uuid(entity_id)
        if parsed is not None and (entity_type, parsed) in owners:
            result[event_id] = owners[(entity_type, parsed)]
    return result


def list_clients(db: Session, date_from: date | None, date_to: date | None, q: str | None, limit: int, offset: int) -> dict:
    start, end = period_bounds(date_from, date_to)
    rows = list(db.execute(
        _period(select(AdminAuditLog.id, AdminAuditLog.entity_type, AdminAuditLog.entity_id, AdminAuditLog.created_at)
                .where(AdminAuditLog.entity_type.in_(CLIENT_ENTITIES)), start, end)
    ))
    owner_of = _client_of_entities(db, rows)
    last: dict[uuid.UUID, datetime] = {}
    events_of: dict[uuid.UUID, list[int]] = defaultdict(list)
    for event_id, _, _, created in rows:
        if event_id in owner_of:
            client = owner_of[event_id]
            events_of[client].append(event_id)
            last[client] = max(last.get(client, created), created)

    candidates = set(last)
    if q:
        pattern = f"%{q.strip()}%"
        matched = set(db.scalars(select(Profile.id).where(or_(Profile.full_name.ilike(pattern), Profile.email.ilike(pattern), Profile.phone.ilike(pattern)))))
        matched |= set(db.scalars(select(Order.user_id).where(Order.reference.ilike(pattern))))
        matched |= set(db.scalars(select(SubscriptionRequest.user_id).where(SubscriptionRequest.reference.ilike(pattern))))
        candidates = matched
    far_past = datetime(1970, 1, 1, tzinfo=ZoneInfo("UTC"))
    ordered = sorted(candidates, key=lambda c: last.get(c, far_past), reverse=True)
    total = len(ordered)
    page = ordered[offset: offset + limit]
    if not page:
        return {"total": total, "clients": []}

    profiles = {p.id: p for p in db.scalars(select(Profile).where(Profile.id.in_(page)))}
    orders = list(db.scalars(select(Order).where(Order.user_id.in_(page)).order_by(Order.created_at.desc())))
    requests = list(db.execute(
        select(SubscriptionRequest, Plan.name).join(Plan, Plan.id == SubscriptionRequest.plan_id)
        .where(SubscriptionRequest.user_id.in_(page)).order_by(SubscriptionRequest.created_at.desc())
    ))
    payments = {p.id: p for p in db.scalars(select(Payment).where(Payment.user_id.in_(page)))}
    subs = {s.user_id: (s, name) for s, name in db.execute(
        select(Subscription, Plan.name).join(Plan, Plan.id == Subscription.plan_id).where(Subscription.user_id.in_(page)))}

    event_ids = [e for c in page for e in events_of.get(c, [])]
    logs = list(db.scalars(select(AdminAuditLog).where(AdminAuditLog.id.in_(event_ids)).order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc()))) if event_ids else []
    shown = {e["id"]: e for e in presenter.present(db, logs)}
    log_entity = {log.id: (log.entity_type, log.entity_id) for log in logs}

    payment_by_order = {p.order_id: p for p in payments.values() if p.order_id}
    payment_by_request = {p.subscription_request_id: p for p in payments.values() if p.subscription_request_id}
    now = clock.now()
    clients = []
    for client_id in page:
        profile = profiles.get(client_id)
        refs: dict[str, list[dict]] = defaultdict(list)  # clave -> eventos
        sub_events: list[dict] = []
        for event_id in sorted(events_of.get(client_id, []), key=lambda i: -i):
            event = shown[event_id]
            type_, entity_id = log_entity[event_id]
            parsed = _uuid(entity_id)
            if type_ == "subscription":
                sub_events.append(event)
            elif type_ == "order":
                refs[f"order:{parsed}"].append(event)
            elif type_ == "subscription_request":
                refs[f"request:{parsed}"].append(event)
            elif type_ == "payment" and parsed in payments:
                p = payments[parsed]
                refs[f"order:{p.order_id}" if p.order_id else f"request:{p.subscription_request_id}"].append(event)
        my_orders = [o for o in orders if o.user_id == client_id]
        my_requests = [(r, name) for r, name in requests if r.user_id == client_id]
        wanted_orders = [o for o in my_orders if f"order:{o.id}" in refs] or my_orders[:3 if not refs else 0]
        wanted_requests = [(r, n) for r, n in my_requests if f"request:{r.id}" in refs] or my_requests[:3 if not refs else 0]
        order_cards = []
        for o in wanted_orders:
            pay = payment_by_order.get(o.id)
            order_cards.append({
                "reference": o.reference, "total": o.total, "status": presenter.status_tag(presenter.ORDER_STATUS, o.status),
                "payment": presenter.status_tag(presenter.PAYMENT_STATUS, pay.status if pay else None),
                "reserved_until": presenter.fmt_datetime(o.reservation_expires_at) if o.status == "pending_payment" else None,
                "events": refs.get(f"order:{o.id}", []),
            })
        request_cards = []
        for r, plan_name in wanted_requests:
            pay = payment_by_request.get(r.id)
            request_cards.append({
                "reference": r.reference, "plan": plan_name, "agreed_price": r.agreed_price,
                "status": presenter.status_tag(presenter.REQUEST_STATUS, r.status),
                "payment": presenter.status_tag(presenter.PAYMENT_STATUS, pay.status if pay else None),
                "events": refs.get(f"request:{r.id}", []),
            })
        subscription = None
        if client_id in subs:
            sub, plan_name = subs[client_id]
            status = "expired" if sub.status == "active" and sub.ends_at and sub.ends_at <= now else sub.status
            text = {
                "active": f"Activa hasta {presenter.fmt_date(sub.ends_at)}" if sub.ends_at else "Activa",
                "expired": f"Venció el {presenter.fmt_date(sub.ends_at)}" if sub.ends_at else "Vencida",
                "cancelled": "Cancelada", "pending_payment": "Esperando pago",
            }[status]
            subscription = {"plan": plan_name, "status": presenter.status_tag(presenter.SUBSCRIPTION_STATUS, status), "text": text, "events": sub_events}
        clients.append({
            "id": str(client_id),
            "name": (profile.full_name or profile.email) if profile else "Cliente",
            "email": profile.email if profile else None,
            "phone": profile.phone if profile else None,
            "last_activity": presenter.fmt_datetime(last[client_id]) if client_id in last else None,
            "orders": order_cards, "requests": request_cards, "subscription": subscription,
        })
    return {"total": total, "clients": clients}
