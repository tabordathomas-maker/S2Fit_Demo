"""Acceso a Mi Ruta: códigos (o QR) que genera el admin y habilitación de la cuenta.

Tiene acceso quien cumpla al menos una: un código válido en el header, Mi Ruta habilitada en la
cuenta (compra confirmada, código canjeado o admin), ser admin o tener una membresía S2 Box activa.
"""

import re
import uuid
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, conflict, not_found, resource_in_use
from app.core.references import ALPHABET, new_code
from app.models import AccessCode, Profile
from app.schemas.access_codes import AccessCodeCreate, AccessCodeUpdate
from app.services import audit, subscriptions

CODE_LENGTH = 6
INVALID_MESSAGE = "Código no válido o vencido"
_NOISE = re.compile(r"[\s\-_]+")


def normalize_code(raw: str | None) -> str:
    """Mayúsculas, sin espacios ni guiones: «k7m-2qx» -> «K7M2QX»."""
    return _NOISE.sub("", raw or "").upper()


def _well_formed(code: str) -> bool:
    return len(code) == CODE_LENGTH and all(ch in ALPHABET for ch in code)


def invalid_code() -> AppError:
    # Mismo error para inexistente, inactivo y vencido: no revela cuáles códigos existen.
    return AppError(400, "invalid_code", INVALID_MESSAGE)


def status_of(code: AccessCode, now: datetime) -> str:
    if not code.is_active:
        return "inactive"
    if code.expires_at is not None and code.expires_at <= now:
        return "expired"
    return "active"


def _find(db: Session, raw: str | None) -> AccessCode | None:
    code = normalize_code(raw)
    if not _well_formed(code):
        return None
    return db.scalar(select(AccessCode).where(AccessCode.code == code))


def find_valid(db: Session, raw: str | None, now: datetime) -> AccessCode | None:
    found = _find(db, raw)
    return found if found is not None and status_of(found, now) == "active" else None


def verify(db: Session, raw: str, now: datetime) -> AccessCode:
    """Valida el código y registra el uso (solo aquí y al canjear, no en cada petición)."""
    code = find_valid(db, raw, now)
    if code is None:
        raise invalid_code()
    code.used_count += 1
    code.last_used_at = now
    return code


def redeem(db: Session, user: Profile, raw: str, now: datetime) -> AccessCode:
    """Liga el código a la cuenta y habilita Mi Ruta. Canjearlo de nuevo con la misma cuenta no cambia nada."""
    code = _find(db, raw)
    if code is None:
        raise invalid_code()
    if user.mi_ruta_code_id == code.id:
        return code
    if status_of(code, now) != "active":
        raise invalid_code()
    owner = db.scalar(select(Profile.id).where(Profile.mi_ruta_code_id == code.id, Profile.id != user.id))
    if owner is not None:
        raise conflict("code_already_linked", "Este código ya está ligado a otra cuenta.")
    user.mi_ruta_code_id = code.id
    if user.mi_ruta_unlocked_at is None:
        user.mi_ruta_unlocked_at = now
        user.mi_ruta_unlock_source = "code"
    code.used_count += 1
    code.last_used_at = now
    db.flush()
    return code


def unlock_by_order(db: Session, user_id: uuid.UUID, now: datetime) -> bool:
    """Un pedido confirmado habilita Mi Ruta si aún no estaba habilitada. Devuelve True si la habilitó."""
    profile = db.get(Profile, user_id)
    if profile is None or profile.mi_ruta_unlocked_at is not None:
        return False
    profile.mi_ruta_unlocked_at = now
    profile.mi_ruta_unlock_source = "order"
    return True


def set_by_admin(db: Session, admin: Profile, profile: Profile, enabled: bool, now: datetime) -> None:
    """Habilita o quita Mi Ruta a mano. Quitarla no desliga el código de la cuenta."""
    if enabled:
        if profile.mi_ruta_unlocked_at is None:
            profile.mi_ruta_unlocked_at = now
            profile.mi_ruta_unlock_source = "admin"
    else:
        profile.mi_ruta_unlocked_at = None
        profile.mi_ruta_unlock_source = None
    audit.record(db, admin, "mi_ruta.enable" if enabled else "mi_ruta.disable", "profile", profile.id, {})


def access_source(db: Session, user: Profile | None, raw_code: str | None, now: datetime) -> str | None:
    """Por qué tiene acceso (admin, membership, order, code) o None si no lo tiene."""
    if user is not None:
        if user.is_admin:
            return "admin"
        if user.mi_ruta_unlocked_at is not None:
            return user.mi_ruta_unlock_source or "admin"
        if subscriptions.has_active_membership(db, user.id, now):
            return "membership"
    if raw_code and find_valid(db, raw_code, now) is not None:
        return "code"
    return None


def has_mi_ruta_access(db: Session, user: Profile | None, raw_code: str | None, now: datetime) -> bool:
    return access_source(db, user, raw_code, now) is not None


# --- Administración ---------------------------------------------------------------------------

def get_code(db: Session, code_id: int) -> AccessCode:
    code = db.get(AccessCode, code_id)
    if code is None:
        raise not_found("El código no existe.")
    return code


def generate(db: Session, admin: Profile, data: AccessCodeCreate) -> list[AccessCode]:
    created: list[AccessCode] = []
    taken: set[str] = set()
    while len(created) < data.quantity:
        candidates = {new_code(CODE_LENGTH) for _ in range(data.quantity - len(created))} - taken
        existing = set(db.scalars(select(AccessCode.code).where(AccessCode.code.in_(candidates))))
        for value in candidates - existing:
            code = AccessCode(
                code=value, note=data.note, phone=data.phone, expires_at=data.expires_at, created_by=admin.id
            )
            db.add(code)
            created.append(code)
        taken |= candidates
    db.flush()
    for code in created:
        audit.record(db, admin, "access_code.create", "access_code", code.id, {})
    return created


def _linked_accounts(db: Session, code_ids: list[int]) -> dict[int, Profile]:
    if not code_ids:
        return {}
    rows = db.scalars(select(Profile).where(Profile.mi_ruta_code_id.in_(code_ids)))
    return {p.mi_ruta_code_id: p for p in rows}


def present(db: Session, codes: list[AccessCode], now: datetime) -> list[dict]:
    linked = _linked_accounts(db, [c.id for c in codes])
    rows = []
    for code in codes:
        owner = linked.get(code.id)
        rows.append({
            "id": code.id, "code": code.code, "note": code.note, "phone": code.phone, "is_active": code.is_active,
            "expires_at": code.expires_at, "used_count": code.used_count, "last_used_at": code.last_used_at,
            "created_at": code.created_at, "status": status_of(code, now),
            "linked_email": owner.email if owner else None, "linked_name": owner.full_name if owner else None,
        })
    return rows


def list_codes(db: Session, q: str | None, status: str | None, now: datetime) -> list[AccessCode]:
    stmt = select(AccessCode)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(AccessCode.code.ilike(normalize_code(q) + "%"), AccessCode.note.ilike(pattern)))
    if status == "inactive":
        stmt = stmt.where(AccessCode.is_active.is_(False))
    elif status == "expired":
        stmt = stmt.where(AccessCode.is_active.is_(True), AccessCode.expires_at <= now)
    elif status == "active":
        stmt = stmt.where(AccessCode.is_active.is_(True), or_(AccessCode.expires_at.is_(None), AccessCode.expires_at > now))
    return list(db.scalars(stmt.order_by(AccessCode.created_at.desc(), AccessCode.id.desc()).limit(500)))


def update_code(db: Session, admin: Profile, code_id: int, data: AccessCodeUpdate) -> AccessCode:
    code = get_code(db, code_id)
    changes = data.model_dump(exclude_unset=True)
    if "is_active" in changes and changes["is_active"] is None:
        changes.pop("is_active")
    for field, value in changes.items():
        setattr(code, field, value)
    if "is_active" in changes:
        action = "access_code.activate" if changes["is_active"] else "access_code.deactivate"
    else:
        action = "access_code.update"
    audit.record(db, admin, action, "access_code", code.id, {"changed_fields": sorted(changes)})
    return code


def delete_code(db: Session, admin: Profile, code_id: int) -> None:
    code = get_code(db, code_id)
    linked = db.scalar(select(func.count(Profile.id)).where(Profile.mi_ruta_code_id == code.id)) or 0
    if code.used_count or linked:
        raise resource_in_use(
            "Este código ya se usó; desactívalo en lugar de eliminarlo.",
            {"used_count": code.used_count, "linked_accounts": linked},
        )
    audit.record(db, admin, "access_code.delete", "access_code", code.id, {})
    db.delete(code)
