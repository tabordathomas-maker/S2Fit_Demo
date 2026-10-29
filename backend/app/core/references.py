import secrets

# Sin caracteres ambiguos (0/O, 1/I) para que se puedan dictar por WhatsApp.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_reference(prefix: str, length: int = 8) -> str:
    return f"S2-{prefix}-" + "".join(secrets.choice(_ALPHABET) for _ in range(length))
