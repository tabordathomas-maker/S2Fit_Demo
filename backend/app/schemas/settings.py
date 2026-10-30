from datetime import datetime

from pydantic import Field

from app.schemas.common import InputModel, ORMModel


class PublicSettingsOut(ORMModel):
    whatsapp_number: str | None


class AdminSettingsOut(ORMModel):
    whatsapp_number: str | None
    updated_at: datetime | None
    updated_by_email: str | None


class SettingsUpdate(InputModel):
    # Se normaliza en el servicio (quita espacios, guiones y "+", añade 57 si hace falta).
    whatsapp_number: str | None = Field(default=None, max_length=30)
