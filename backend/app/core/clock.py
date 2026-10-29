"""Fuente única de la hora actual, para que las pruebas puedan simular el paso del tiempo."""

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from app.core.config import get_settings


def now() -> datetime:
    return datetime.now(UTC)


def local_today() -> date:
    return now().astimezone(ZoneInfo(get_settings().app_timezone)).date()
