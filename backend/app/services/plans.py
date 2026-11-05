"""Planes de S2 Box creados por el admin: nombre normalizado, código automático y nombres únicos."""

import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import conflict
from app.models import Plan, Profile, Subscription, SubscriptionRequest
from app.schemas.subscriptions import PlanCreate
from app.services import audit

CODE_MAX = 40
FALLBACK_CODE = "plan"


def normalize_name(raw: str) -> str:
    """Sin espacios al inicio ni al final y con los espacios internos repetidos colapsados."""
    return re.sub(r"\s+", " ", raw).strip()


def fold(text: str) -> str:
    """Minúsculas, sin tildes y sin espacios repetidos: «S2 Box Mamá» y «s2 box mama» son el mismo nombre."""
    decomposed = unicodedata.normalize("NFD", normalize_name(text).lower())
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn")


def slugify_code(name: str) -> str:
    """«S2 Box Mamá & Hija» → «s2-box-mama-hija». Respaldo «plan» si queda con menos de 2 caracteres."""
    ascii_text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]", "-", ascii_text)).strip("-")[:CODE_MAX].rstrip("-")
    return slug if len(slug) >= 2 else FALLBACK_CODE


def unique_code(base: str, taken: set[str]) -> str:
    """Si el código ya existe agrega -2, -3… sin pasar de 40 caracteres."""
    if base not in taken:
        return base
    n = 2
    while True:
        suffix = f"-{n}"
        candidate = base[: CODE_MAX - len(suffix)].rstrip("-") + suffix
        if candidate not in taken:
            return candidate
        n += 1


def ensure_name_free(db: Session, name: str, exclude_id: int | None = None) -> None:
    """Nombre único entre los planes NO eliminados, sin distinguir mayúsculas, tildes ni espacios repetidos."""
    wanted = fold(name)
    rows = db.execute(select(Plan.id, Plan.name).where(Plan.deleted_at.is_(None)))
    if any(plan_id != exclude_id and fold(existing) == wanted for plan_id, existing in rows):
        raise conflict("PLAN_NAME_TAKEN", f"Ya existe un plan llamado «{name}». Usa otro nombre.")


def code_taken(db: Session, code: str) -> bool:
    return db.scalar(select(Plan.id).where(Plan.code == code)) is not None


def has_history(db: Session, plan_id: int) -> bool:
    """Alguna solicitud o suscripción (de cualquier estado) apunta al plan."""
    return (
        db.scalar(select(SubscriptionRequest.id).where(SubscriptionRequest.plan_id == plan_id).limit(1)) is not None
        or db.scalar(select(Subscription.id).where(Subscription.plan_id == plan_id).limit(1)) is not None
    )


def create_plan(db: Session, admin: Profile, data: PlanCreate) -> Plan:
    ensure_name_free(db, data.name)
    values = data.model_dump()
    if values["code"]:
        if code_taken(db, values["code"]):
            raise conflict("PLAN_CODE_TAKEN", f"Ya existe un plan con el código «{values['code']}».")
    else:
        values["code"] = unique_code(slugify_code(data.name), set(db.scalars(select(Plan.code))))
    plan = Plan(**values)
    db.add(plan)
    db.flush()
    audit.record(db, admin, "plan.create", "plan", plan.id, {k: values[k] for k in values})
    return plan
