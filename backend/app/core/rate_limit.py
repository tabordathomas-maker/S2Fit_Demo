"""Limitador de solicitudes en memoria (ventana deslizante de 60 s).

Es suficiente para una sola instancia en Render. Con varias instancias cada una
lleva su propio conteo; en ese caso conviene moverlo a Redis.
"""

import threading
import time
from collections import defaultdict, deque

from app.core.config import get_settings
from app.core.errors import AppError

_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def check_rate_limit(bucket: str, key: str) -> None:
    limit = get_settings().rate_limit_per_minute
    now = time.monotonic()
    with _lock:
        hits = _hits[f"{bucket}:{key}"]
        while hits and now - hits[0] > 60:
            hits.popleft()
        if len(hits) >= limit:
            raise AppError(429, "rate_limited", "Demasiadas solicitudes. Espera un minuto e intenta de nuevo.")
        hits.append(now)


def reset_rate_limits() -> None:
    with _lock:
        _hits.clear()
