import uuid
from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.phones import normalize_co_mobile
from app.core.security import unauthorized
from app.models import Profile
from app.models.enums import Role


def _clean(value: Any, max_length: int) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value[:max_length] or None


def get_or_create_profile(db: Session, claims: dict[str, Any]) -> Profile:
    """Devuelve el perfil del usuario autenticado, creándolo la primera vez.

    El rol siempre empieza como "customer": se ignora cualquier rol que venga en los
    metadatos del registro, porque esos metadatos los controla el propio usuario.
    """
    try:
        user_id = uuid.UUID(str(claims["sub"]))
    except (KeyError, ValueError) as exc:
        raise unauthorized() from exc

    profile = db.get(Profile, user_id)
    if profile is not None:
        return profile

    metadata = claims.get("user_metadata") or {}
    try:
        phone = normalize_co_mobile(_clean(metadata.get("phone"), 30))
    except ValueError:
        phone = None  # los metadatos los controla el usuario: un valor inválido se descarta
    db.execute(
        insert(Profile)
        .values(
            id=user_id,
            email=_clean(claims.get("email"), 320),
            full_name=_clean(metadata.get("full_name"), 120),
            phone=phone,
            role=Role.customer.value,
        )
        .on_conflict_do_nothing(index_elements=["id"])
    )
    db.commit()
    return db.get(Profile, user_id)
