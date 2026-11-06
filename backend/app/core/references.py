import secrets

# Sin caracteres ambiguos (0/O, 1/I) para que se puedan dictar por WhatsApp.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ALPHABET = _ALPHABET


def new_code(length: int = 6) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def new_reference(prefix: str, length: int = 8) -> str:
    return f"S2-{prefix}-" + "".join(secrets.choice(_ALPHABET) for _ in range(length))
