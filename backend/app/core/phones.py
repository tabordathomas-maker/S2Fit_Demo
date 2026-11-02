"""Celulares colombianos: se guardan como 10 dígitos limpios, por ejemplo "3001234567"."""

import re

INVALID_PHONE_MESSAGE = "Escribe tu celular de 10 dígitos, por ejemplo 300 123 4567."

_ALLOWED = re.compile(r"^[0-9+\s().-]+$")


def normalize_co_mobile(raw: str | None) -> str | None:
    """Devuelve los 10 dígitos del celular, None si está vacío o lanza ValueError si no es válido.

    Acepta espacios, guiones, paréntesis y puntos, y también el prefijo +57 o 57.
    """
    if raw is None or not raw.strip():
        return None
    if not _ALLOWED.match(raw):
        raise ValueError(INVALID_PHONE_MESSAGE)
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 12 and digits.startswith("57"):
        digits = digits[2:]
    if not re.fullmatch(r"3\d{9}", digits):
        raise ValueError(INVALID_PHONE_MESSAGE)
    return digits
