"""Piezas comunes del CRUD de administración: archivar/restaurar, eliminar con referencias y auditoría de cambios."""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import resource_in_use
from app.models import Profile
from app.services import audit


def _jsonable(value: Any) -> Any:
    return value.isoformat() if isinstance(value, (datetime, date)) else str(value) if isinstance(value, uuid.UUID) else value


def changed_fields(obj: object, changes: dict[str, Any]) -> dict[str, Any]:
    """Solo los campos que realmente cambian de valor."""
    return {field: value for field, value in changes.items() if getattr(obj, field) != value}


def apply_update(db: Session, admin: Profile, obj: object, entity_type: str, entity_id: object, changes: dict[str, Any]) -> dict:
    """Aplica un PATCH parcial y lo audita con los campos modificados (antes y después)."""
    real = changed_fields(obj, changes)
    before = {field: _jsonable(getattr(obj, field)) for field in real}
    for field, value in real.items():
        setattr(obj, field, value)
    if real:
        audit.record(db, admin, f"{entity_type}.update", entity_type, entity_id,
                     {"changed_fields": sorted(real), "before": before,
                      "after": {field: _jsonable(value) for field, value in real.items()}})
    return real


def set_archived(db: Session, admin: Profile, obj: object, entity_type: str, entity_id: object, archived: bool,
                 flag: str = "is_active") -> None:
    """Archiva (flag en False) o restaura (flag en True) usando la columna que ya tiene la entidad."""
    setattr(obj, flag, not archived)
    if not archived and hasattr(obj, "deleted_at"):
        obj.deleted_at = None  # restaurar también saca de «eliminados»
    audit.record(db, admin, f"{entity_type}.{'archive' if archived else 'restore'}", entity_type, entity_id, {})


def block_if_referenced(message: str, references: dict[str, int]) -> None:
    """409 RESOURCE_IN_USE si alguna referencia tiene registros; `details` lleva los conteos."""
    used = {name: count for name, count in references.items() if count}
    if used:
        raise resource_in_use(message, used)


def plural(count: int, singular: str, plural_form: str) -> str:
    return f"{count} {singular if count == 1 else plural_form}"


MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def short_date(value: datetime) -> str:
    """«12 dic 2026» en hora de Colombia."""
    from app.core.config import get_settings
    from zoneinfo import ZoneInfo

    local = value.astimezone(ZoneInfo(get_settings().app_timezone))
    return f"{local.day} {MONTHS[local.month - 1]} {local.year}"


def delete_or_soft_delete(
    db: Session, admin: Profile, obj: object, entity_type: str, entity_id: object, action_prefix: str,
    live: dict[str, int], historical: dict[str, int], live_message: str,
) -> str:
    """Borra de verdad si nada lo referencia, oculta (eliminación lógica) si solo tiene historial y bloquea si hay algo vigente.

    Devuelve "deleted" o "soft_deleted"; con algo vigente lanza 409 RESOURCE_IN_USE (details: live e historical).
    """
    live = {k: v for k, v in live.items() if v}
    historical = {k: v for k, v in historical.items() if v}
    if live:
        raise resource_in_use(live_message, {"live": live, "historical": historical})
    if historical:
        obj.deleted_at = clock.now()
        obj.is_active = False
        audit.record(db, admin, f"{action_prefix}.soft_delete", entity_type, entity_id, {"historical": historical})
        return "soft_deleted"
    audit.record(db, admin, f"{action_prefix}.delete", entity_type, entity_id, {})
    db.delete(obj)
    return "deleted"
