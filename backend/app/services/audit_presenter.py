"""Convierte el registro de auditoría en frases y cambios legibles en español (nunca JSON ni UUIDs).

Cada acción tiene una categoría y una frase en el REGISTRO. Los nombres (producto, plan, cliente…) se resuelven en lote
por tipo de entidad, así que mostrar una página de eventos no hace una consulta por fila.
"""

import uuid
from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    AdminAuditLog, BoxImage, Category, Challenge, ContentItem, CustomRoutine, Order, Payment, Plan, Product,
    ProductVariant, Profile, Reward, RewardRedemption, RoutineStep, Subscription, SubscriptionRequest,
)

MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

# ---------------------------------------------------------------- estados en español (etiqueta, tono)
ORDER_STATUS = {
    "pending_payment": ("Esperando pago", "warning"), "paid": ("Pagado", "success"), "cancelled": ("Cancelado", "neutral"),
    "expired": ("Reserva vencida", "danger"), "refunded": ("Reembolsado", "danger"),
}
PAYMENT_STATUS = {
    "pending": ("Pendiente", "warning"), "in_review": ("En revisión", "warning"), "confirmed": ("Confirmado", "success"),
    "rejected": ("Rechazado", "danger"), "refunded": ("Reembolsado", "danger"), "cancelled": ("Cancelado", "neutral"),
}
SUBSCRIPTION_STATUS = {
    "pending_payment": ("Esperando pago", "warning"), "active": ("Activa", "success"), "expired": ("Vencida", "danger"),
    "cancelled": ("Cancelada", "neutral"),
}
REQUEST_STATUS = {
    "pending_payment": ("Esperando pago", "warning"), "paid": ("Pagada", "success"), "rejected": ("Rechazada", "danger"),
    "cancelled": ("Cancelada", "neutral"),
}
ANY_STATUS = {**{k: v[0] for k, v in ORDER_STATUS.items()}, **{k: v[0] for k, v in PAYMENT_STATUS.items()},
              **{k: v[0] for k, v in SUBSCRIPTION_STATUS.items()}, **{k: v[0] for k, v in REQUEST_STATUS.items()},
              "draft": "Borrador", "active": "Activa", "archived": "Archivada"}


def status_tag(table: dict, value: str | None) -> dict | None:
    if value is None:
        return None
    label, tone = table.get(value, (value, "neutral"))
    return {"label": label, "tone": tone}


# ---------------------------------------------------------------- formato de valores
def bogota(dt: datetime) -> datetime:
    return dt.astimezone(ZoneInfo(get_settings().app_timezone))


def fmt_date(dt: datetime | date) -> str:
    local = bogota(dt) if isinstance(dt, datetime) else dt
    return f"{local.day} {MONTHS[local.month - 1]} {local.year}"


def fmt_datetime(dt: datetime) -> str:
    """«5 nov 2026, 4:12 p. m.» en hora de Colombia."""
    local = bogota(dt)
    hour = local.hour % 12 or 12
    return f"{fmt_date(local)}, {hour}:{local.minute:02d} {'a. m.' if local.hour < 12 else 'p. m.'}"


def fmt_cop(amount: int | float) -> str:
    return "$" + f"{int(round(amount)):,}".replace(",", ".")


PRICE_FIELDS = {"price", "base_price", "amount", "agreed_price", "total", "subtotal", "price_override", "unit_price"}
FIELD_LABELS = {
    "price": "Precio", "base_price": "Precio", "price_override": "Precio especial", "unit_price": "Precio", "amount": "Monto",
    "agreed_price": "Precio acordado", "agreed_duration_days": "Vigencia acordada (días)", "total": "Total", "subtotal": "Subtotal",
    "is_active": "Visible", "is_published": "Publicado", "hide_price": "Ocultar precio", "duration_days": "Duración (días)",
    "period_label": "Periodicidad", "title": "Título", "name": "Nombre", "description": "Descripción", "status": "Estado",
    "stock": "Existencias", "stock_on_hand": "Existencias", "customer_note": "Nota del pedido", "items": "Productos",
    "sort_order": "Orden", "benefits": "Beneficios", "summary": "Resumen", "body": "Contenido", "meta": "Detalle", "kind": "Tipo",
    "goal": "Objetivo", "sequential": "Pasos en orden", "target_count": "Días del reto", "threshold_pct": "Porcentaje",
    "admin_notes": "Observaciones", "starts_at": "Inicio", "ends_at": "Vence", "code": "Código", "slug": "Enlace", "color": "Color",
    "size": "Talla", "alt_text": "Texto alternativo", "meal_slot": "Franja", "image_url": "Imagen", "cover_url": "Portada",
    "media_url": "Video o imagen", "url": "Imagen", "instructions": "Instrucciones", "block_label": "Bloque",
    "sets_reps": "Series y repeticiones", "duration_minutes": "Duración (min)", "method": "Medio de pago", "notes": "Notas",
    "category_id": "Categoría", "is_demo": "Demostración", "access": "Acceso",
}
IMAGE_FIELDS = {"image_url", "cover_url", "media_url", "url"}
HIDDEN_FIELDS = {"id", "created_at", "updated_at", "deleted_at", "created_by", "user_id", "routine_id", "reference", "operation_reference"}
METHODS = {"transfer": "Transferencia", "deposit": "Consignación", "cash": "Efectivo", "other": "Otro"}


def _short(text: str, limit: int = 120) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def fmt_value(field_name: str, value: Any) -> str:
    if value is None or value == "":
        return "—"
    if field_name in PRICE_FIELDS and isinstance(value, (int, float)) and not isinstance(value, bool):
        return fmt_cop(value)
    if isinstance(value, bool):
        return "Sí" if value else "No"
    if field_name == "status" and isinstance(value, str):
        return ANY_STATUS.get(value, value)
    if field_name == "method" and isinstance(value, str):
        return METHODS.get(value, value)
    if field_name == "items" and isinstance(value, dict):
        return f"{sum(int(v) for v in value.values())} unidades"
    if isinstance(value, (list, tuple)):
        return _short(", ".join(str(v) for v in value) or "—")
    if isinstance(value, str) and (field_name.endswith("_at") or field_name in {"expires_at"}):
        try:
            return fmt_datetime(datetime.fromisoformat(value))
        except ValueError:
            pass
    if isinstance(value, dict):
        return _short(", ".join(f"{k}: {v}" for k, v in value.items()))
    return _short(str(value))


def changes_from(details: dict) -> list[dict]:
    """Filas «campo / antes / después» a partir de lo que guardó la acción."""
    fields = details.get("changed_fields") or details.get("fields") or []
    before = details.get("before") if isinstance(details.get("before"), dict) else {}
    after = details.get("after") if isinstance(details.get("after"), dict) else {}
    rows: list[dict] = []
    for name in fields:
        if name in HIDDEN_FIELDS or name.endswith("_id"):
            continue
        if name in IMAGE_FIELDS:
            rows.append({"field": FIELD_LABELS.get(name, name), "before": "—", "after": "se cambió la imagen"})
            continue
        new = after.get(name, details.get(name))
        old = before.get(name)
        if name == "items" and isinstance(new, dict):
            old, new = new.get("before"), new.get("after")
        rows.append({"field": FIELD_LABELS.get(name, name.replace("_", " ").capitalize()), "before": fmt_value(name, old), "after": fmt_value(name, new)})
    return rows


# ---------------------------------------------------------------- entidades
TYPE_NOUN = {
    "product": "el producto", "product_variant": "la variante", "category": "la categoría", "plan": "el plan", "content": "el contenido",
    "challenge": "el reto", "reward": "la recompensa", "routine": "la rutina", "routine_step": "el paso de rutina",
    "box_image": "la foto de la caja", "payment": "el pago", "order": "el pedido", "subscription_request": "la solicitud",
    "subscription": "la suscripción", "reward_redemption": "el canje", "storage": "el archivo", "site_settings": "la configuración",
}
TYPE_LABEL = {
    "product": "Producto", "product_variant": "Variante", "category": "Categoría", "plan": "Plan", "content": "Contenido",
    "challenge": "Reto", "reward": "Recompensa", "routine": "Rutina", "routine_step": "Paso de rutina", "box_image": "Foto de la caja",
    "payment": "Pago", "order": "Pedido", "subscription_request": "Solicitud S2 Box", "subscription": "Suscripción",
    "reward_redemption": "Canje", "storage": "Archivo", "site_settings": "Configuración",
}
ENTITY_CATEGORY = {
    "payment": "Pagos", "order": "Pedidos", "plan": "Planes y S2 Box", "subscription_request": "Planes y S2 Box",
    "box_image": "Planes y S2 Box", "subscription": "Usuarios y membresías", "site_settings": "Usuarios y membresías",
    "content": "Contenido", "challenge": "Contenido", "reward": "Contenido", "routine": "Contenido", "routine_step": "Contenido",
    "reward_redemption": "Contenido", "product": "Catálogo", "product_variant": "Catálogo", "category": "Catálogo", "storage": "Archivos",
}
CATEGORIES = ["Pagos", "Pedidos", "Planes y S2 Box", "Contenido", "Catálogo", "Usuarios y membresías", "Archivos"]
GENERIC_VERBS = {
    "create": "creó", "update": "editó", "archive": "archivó", "restore": "restauró", "delete": "eliminó",
    "soft_delete": "eliminó (el historial se conserva)",
}
GENERIC_TYPES = ["product", "product_variant", "category", "plan", "content", "challenge", "reward", "routine", "routine_step", "box_image"]


@dataclass
class Ent:
    type: str
    id: str
    name: str | None = None
    ref: str | None = None
    amount: int | None = None
    user_id: uuid.UUID | None = None
    status: str | None = None
    exists: bool = True
    extra: dict = field(default_factory=dict)


def _uuids(ids: Iterable[str]) -> list[uuid.UUID]:
    out = []
    for value in ids:
        try:
            out.append(uuid.UUID(value))
        except ValueError:
            continue
    return out


def _ints(ids: Iterable[str]) -> list[int]:
    return [int(v) for v in ids if str(v).isdigit()]


class Resolver:
    """Nombres, referencias y clientes de las entidades de una página de eventos (una consulta por tipo)."""

    def __init__(self, db: Session, logs: list[AdminAuditLog]):
        self.db = db
        self.ents: dict[tuple[str, str], Ent] = {}
        self.people: dict[uuid.UUID, Profile] = {}
        wanted: dict[str, set[str]] = defaultdict(set)
        for log in logs:
            wanted[log.entity_type].add(log.entity_id)
        self._load(wanted)
        people = {log.admin_id for log in logs} | {e.user_id for e in self.ents.values() if e.user_id}
        people |= {u for log in logs for u in _uuids([str(log.details.get("user_id"))]) if log.details.get("user_id")}
        if people:
            self.people = {p.id: p for p in db.scalars(select(Profile).where(Profile.id.in_(people)))}

    def _put(self, ent: Ent) -> None:
        self.ents[(ent.type, ent.id)] = ent

    def _load(self, wanted: dict[str, set[str]]) -> None:
        db = self.db
        if ids := _ints(wanted.get("product", ())):
            for p in db.scalars(select(Product).where(Product.id.in_(ids))):
                self._put(Ent("product", str(p.id), p.name, amount=p.base_price))
        if ids := _ints(wanted.get("product_variant", ())):
            rows = db.execute(select(ProductVariant, Product.name).join(Product, Product.id == ProductVariant.product_id).where(ProductVariant.id.in_(ids)))
            for v, product_name in rows:
                self._put(Ent("product_variant", str(v.id), f"{product_name} ({v.color})", extra={"sku": v.sku}))
        for type_, model, attr in [("category", Category, "name"), ("plan", Plan, "name"), ("content", ContentItem, "title"),
                                   ("challenge", Challenge, "title"), ("reward", Reward, "name"), ("routine", CustomRoutine, "title"),
                                   ("routine_step", RoutineStep, "title")]:
            if ids := _ints(wanted.get(type_, ())):
                for obj in db.scalars(select(model).where(model.id.in_(ids))):
                    ent = Ent(type_, str(obj.id), getattr(obj, attr))
                    if type_ == "plan":
                        ent.amount = obj.price
                        ent.extra = {"duration_days": obj.duration_days}
                    if type_ == "routine":
                        ent.user_id = obj.user_id
                    self._put(ent)
        if ids := _ints(wanted.get("box_image", ())):
            for img in db.scalars(select(BoxImage).where(BoxImage.id.in_(ids))):
                self._put(Ent("box_image", str(img.id), img.alt_text or f"foto #{img.id}"))
        if ids := _uuids(wanted.get("order", ())):
            for o in db.scalars(select(Order).where(Order.id.in_(ids))):
                self._put(Ent("order", str(o.id), o.reference, ref=o.reference, amount=o.total, user_id=o.user_id, status=o.status))
        if ids := _uuids(wanted.get("subscription_request", ())):
            rows = db.execute(select(SubscriptionRequest, Plan.name).join(Plan, Plan.id == SubscriptionRequest.plan_id).where(SubscriptionRequest.id.in_(ids)))
            for r, plan_name in rows:
                self._put(Ent("subscription_request", str(r.id), r.reference, ref=r.reference, amount=r.agreed_price, user_id=r.user_id,
                              status=r.status, extra={"plan": plan_name}))
        if ids := _uuids(wanted.get("payment", ())):
            rows = db.execute(
                select(Payment, Order.reference, SubscriptionRequest.reference)
                .outerjoin(Order, Order.id == Payment.order_id)
                .outerjoin(SubscriptionRequest, SubscriptionRequest.id == Payment.subscription_request_id)
                .where(Payment.id.in_(ids))
            )
            for p, order_ref, request_ref in rows:
                ref = order_ref or request_ref
                self._put(Ent("payment", str(p.id), ref, ref=ref, amount=p.amount, user_id=p.user_id, status=p.status))
        if ids := _uuids(wanted.get("subscription", ())):
            rows = db.execute(select(Subscription, Plan.name).join(Plan, Plan.id == Subscription.plan_id).where(Subscription.id.in_(ids)))
            for s, plan_name in rows:
                self._put(Ent("subscription", str(s.id), plan_name, user_id=s.user_id, status=s.status, extra={"plan": plan_name}))
        if ids := _ints(wanted.get("reward_redemption", ())):
            rows = db.execute(select(RewardRedemption, Reward.name).join(Reward, Reward.id == RewardRedemption.reward_id).where(RewardRedemption.id.in_(ids)))
            for r, reward_name in rows:
                self._put(Ent("reward_redemption", str(r.id), reward_name, user_id=r.user_id))

    def ent(self, log: AdminAuditLog) -> Ent:
        found = self.ents.get((log.entity_type, log.entity_id))
        if found:
            return found
        d = log.details or {}
        name = d.get("name") or d.get("title") or d.get("reference") or d.get("operation_reference") or d.get("sku")
        user_id = None
        if d.get("user_id"):
            parsed = _uuids([str(d["user_id"])])
            user_id = parsed[0] if parsed else None
        return Ent(log.entity_type, log.entity_id, name or "(eliminado)", ref=d.get("reference") or d.get("operation_reference"),
                   amount=d.get("amount"), user_id=user_id, exists=False)

    def person(self, user_id: uuid.UUID | None) -> str:
        profile = self.people.get(user_id) if user_id else None
        return (profile.full_name or profile.email or "una persona") if profile else "una persona"

    def admin_name(self, admin_id: uuid.UUID) -> str:
        profile = self.people.get(admin_id)
        return (profile.full_name or profile.email or "Admin") if profile else "Admin"


# ---------------------------------------------------------------- frases
@dataclass
class Ctx:
    log: AdminAuditLog
    d: dict
    ent: Ent
    res: Resolver

    @property
    def name(self) -> str:
        return self.ent.name or "(eliminado)"

    @property
    def ref(self) -> str:
        return self.ent.ref or self.d.get("reference") or self.d.get("operation_reference") or f"registro #{self.log.entity_id[:8]}"

    @property
    def amount(self) -> str:
        value = self.d.get("amount", self.ent.amount)
        return fmt_cop(value) if isinstance(value, (int, float)) else "sin monto"

    @property
    def client(self) -> str:
        return self.res.person(self.ent.user_id)


Phrase = Callable[[Ctx], str]
REGISTRY: dict[str, tuple[str, Phrase]] = {}


def _generic(type_: str, verb: str, past: str) -> Phrase:
    noun = TYPE_NOUN[type_]

    def build(c: Ctx) -> str:
        text = f"{past} {noun} «{c.name}»"
        if verb == "create" and type_ == "plan":
            price = c.d.get("price")
            parts = [fmt_cop(price) if isinstance(price, (int, float)) else "precio por definir"]
            if c.d.get("duration_days"):
                parts.append(f"{c.d['duration_days']} días")
            text += f" ({', '.join(parts)})"
        elif verb == "create" and type_ == "product" and isinstance(c.d.get("base_price"), (int, float)):
            text += f" ({fmt_cop(c.d['base_price'])})"
        elif verb == "soft_delete" and c.d.get("historical"):
            text += f": {', '.join(str(v) + ' ' + k for k, v in c.d['historical'].items())}"
        return text

    return build


for _type in GENERIC_TYPES:
    for _verb, _past in GENERIC_VERBS.items():
        REGISTRY[f"{_type}.{_verb}"] = (ENTITY_CATEGORY[_type], _generic(_type, _verb, _past))
for _type in ("content", "challenge", "reward", "category", "product"):
    REGISTRY[f"{_type}.create"] = (ENTITY_CATEGORY[_type], _generic(_type, "create", "creó"))


# La variante se audita como «variant.*» (altas, bajas) y como «product_variant.*» (ediciones, archivado).
for _verb in GENERIC_VERBS:
    REGISTRY[f"variant.{_verb}"] = REGISTRY[f"product_variant.{_verb}"]


def _reg(action: str, category: str, phrase: Phrase) -> None:
    REGISTRY[action] = (category, phrase)


_reg("payment.confirm", "Pagos", lambda c: f"confirmó el pago de {c.ref} ({c.amount})")
_reg("payment.reject", "Pagos", lambda c: f"rechazó el pago de {c.ref}" + (f": {c.d['notes']}" if c.d.get("notes") else ""))
_reg("payment.refund", "Pagos", lambda c: f"registró el reembolso del pago de {c.ref}" + (f": {c.d['notes']}" if c.d.get("notes") else ""))
_reg("payment.in_review", "Pagos", lambda c: f"marcó en revisión el pago de {c.ref}")
_reg("payment.update", "Pagos", lambda c: f"editó el pago de {c.ref}")
_reg("payment.delete", "Pagos", lambda c: f"eliminó el pago de {c.ref}")
_reg("order.cancel", "Pedidos", lambda c: f"canceló el pedido {c.ref}" + (f": {c.d['reason']}" if c.d.get("reason") else ""))
_reg("order.update", "Pedidos", lambda c: f"editó el pedido {c.ref}")
_reg("order.delete", "Pedidos", lambda c: f"eliminó el pedido {c.ref}")
_reg("order.renew_reservation", "Pedidos", lambda c: f"renovó la reserva del pedido {c.ref}")
_reg("order.expire_reservations", "Pedidos", lambda c: f"liberó {c.d.get('expired_orders', 0)} pedidos con la reserva vencida")
_reg("subscription_request.set_terms", "Planes y S2 Box",
     lambda c: f"acordó {fmt_cop(c.d['agreed_price']) if c.d.get('agreed_price') else 'el precio'} con {c.client} para el plan {c.ent.extra.get('plan', 'S2 Box')}")
_reg("subscription_request.update", "Planes y S2 Box", lambda c: f"editó la solicitud {c.ref}")
_reg("subscription_request.delete", "Planes y S2 Box", lambda c: f"eliminó la solicitud {c.ref}")
_reg("subscription.update", "Usuarios y membresías", lambda c: f"cambió las fechas de la suscripción de {c.client}")
_reg("subscription.cancel", "Usuarios y membresías", lambda c: f"canceló la suscripción de {c.client}" + (f": {c.d['reason']}" if c.d.get("reason") else ""))
_reg("membership.grant", "Usuarios y membresías",
     lambda c: f"activó S2 Box a {c.client} por {c.d.get('days', '?')} días" + (f": {c.d['reason']}" if c.d.get("reason") else ""))
_reg("membership.cancel", "Usuarios y membresías", lambda c: f"canceló la membresía de {c.client}" + (f": {c.d['reason']}" if c.d.get("reason") else ""))
_reg("variant.stock_adjust", "Catálogo",
     lambda c: f"ajustó el stock de {c.name}: {c.d.get('stock_on_hand', 0) - c.d.get('delta', 0)} → {c.d.get('stock_on_hand', '?')}"
               + (f" ({c.d['note']})" if c.d.get("note") else ""))
_reg("redemption.decide", "Contenido", lambda c: f"{'entregó' if c.d.get('status') == 'fulfilled' else 'canceló'} el canje «{c.name}» de {c.client}")
_reg("routine.reassign", "Contenido", lambda c: f"reasignó la rutina «{c.name}» a otra persona")
_reg("routine_step.reorder", "Contenido", lambda c: f"reordenó los pasos de la rutina «{c.name}»")
_reg("upload.product_image", "Archivos", lambda c: "subió una imagen de producto")
_reg("upload.box_image", "Archivos", lambda c: "subió una imagen de la S2 Box")
_reg("upload.content_media", "Archivos", lambda c: "subió una imagen" if c.d.get("type") == "image" else "subió un video")
_reg("settings.whatsapp_update", "Usuarios y membresías", lambda c: "cambió el número de WhatsApp de la tienda")


def phrase_for(log: AdminAuditLog, res: Resolver) -> tuple[str, str]:
    ent = res.ent(log)
    ctx = Ctx(log, log.details or {}, ent, res)
    if log.action in REGISTRY:
        category, build = REGISTRY[log.action]
        return category, build(ctx)
    category = ENTITY_CATEGORY.get(log.entity_type, "Usuarios y membresías")
    return category, f"realizó «{log.action}» sobre {TYPE_NOUN.get(log.entity_type, log.entity_type)} {ent.name or ''}".strip()


TRANSITIONS = {
    "payment.confirm": ("Pendiente", "Confirmado"), "payment.reject": ("Pendiente", "Rechazado"),
    "payment.refund": ("Confirmado", "Reembolsado"), "payment.in_review": ("Pendiente", "En revisión"),
}


def present(db: Session, logs: list[AdminAuditLog]) -> list[dict]:
    """Eventos listos para mostrar: frase, categoría, entidad, cambios y (si aplica) cliente y referencia."""
    res = Resolver(db, logs)
    events = []
    for log in logs:
        ent = res.ent(log)
        category, phrase = phrase_for(log, res)
        changes = changes_from(log.details or {})
        if log.action in TRANSITIONS:
            before, after = TRANSITIONS[log.action]
            changes = [{"field": "Estado", "before": before, "after": after}, *changes]
        client_id = ent.user_id if log.entity_type in {"payment", "order", "subscription_request", "subscription"} else None
        events.append({
            "id": log.id,
            "created_at": log.created_at,
            "when": fmt_datetime(log.created_at),
            "admin": res.admin_name(log.admin_id),
            "category": category,
            "action": log.action,
            "phrase": phrase,
            "entity": {"type": TYPE_LABEL.get(log.entity_type, log.entity_type), "name": ent.name or "(eliminado)"},
            "changes": changes,
            "client_id": client_id,
            "reference": ent.ref if log.entity_type in {"payment", "order", "subscription_request"} else None,
        })
    return events


def actions_in_category(category: str) -> list[str]:
    return [action for action, (cat, _) in REGISTRY.items() if cat == category]
