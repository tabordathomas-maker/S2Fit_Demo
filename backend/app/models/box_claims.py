import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, enum_check
from app.models.enums import BoxClaimStatus
from app.models.user import Profile


class BoxClaim(TimestampMixin, Base):
    """Reclamo de la caja S2 Box de una socia activa. Lo decide un administrador."""

    __tablename__ = "box_claims"
    __table_args__ = (enum_check("status", BoxClaimStatus),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    reference: Mapped[str] = mapped_column(String(24), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"), index=True)
    status: Mapped[str] = mapped_column(String(20), default=BoxClaimStatus.pending, index=True)
    customer_note: Mapped[str | None] = mapped_column(String(500))
    admin_notes: Mapped[str | None] = mapped_column(String(500))
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[Profile] = relationship(foreign_keys=[user_id])
