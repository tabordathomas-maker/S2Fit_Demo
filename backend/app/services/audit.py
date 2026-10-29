from typing import Any

from sqlalchemy.orm import Session

from app.models import AdminAuditLog, Profile


def record(
    db: Session, admin: Profile, action: str, entity_type: str, entity_id: object, details: dict[str, Any] | None = None
) -> None:
    """Registra una acción administrativa dentro de la misma transacción que la acción."""
    db.add(
        AdminAuditLog(
            admin_id=admin.id,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            details=details or {},
        )
    )
