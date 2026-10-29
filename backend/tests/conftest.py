"""Configuración de pruebas.

Usa una base de datos PostgreSQL aislada (TEST_DATABASE_URL), que se borra y se
reconstruye con las migraciones de Alembic en cada ejecución. Por seguridad, el
nombre de la base debe terminar en "_test": nunca se ejecuta contra datos reales.
"""

import os
from datetime import UTC, datetime

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://postgres@localhost:54329/s2fit_test"
)
os.environ.update(
    {
        "ENVIRONMENT": "test",
        "DATABASE_URL": TEST_DATABASE_URL,
        "SUPABASE_URL": "https://test-project.supabase.co",
        "SUPABASE_JWT_SECRET": "test-only-secret-with-at-least-32-characters",
        "SUPABASE_SERVICE_ROLE_KEY": "",
        "CORS_ORIGINS": "http://localhost:5173,https://s2fit.github.io",
        "RATE_LIMIT_PER_MINUTE": "1000",
        "RESERVATION_TTL_MINUTES": "60",
    }
)

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, make_url, text  # noqa: E402

from app.core import clock  # noqa: E402
from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.rate_limit import reset_rate_limits  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def pytest_configure(config):
    database = make_url(TEST_DATABASE_URL).database or ""
    if not database.endswith("_test"):
        pytest.exit(f"TEST_DATABASE_URL debe apuntar a una base terminada en '_test' (recibido: {database!r}).")


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    admin_engine = create_engine(TEST_DATABASE_URL, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    admin_engine.dispose()

    cfg = Config(os.path.join(BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND_DIR, "alembic"))
    cfg.attributes["database_url"] = TEST_DATABASE_URL
    command.upgrade(cfg, "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_tables():
    reset_rate_limits()
    yield
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


class FrozenClock:
    def __init__(self, start: datetime):
        self.current = start

    def __call__(self) -> datetime:
        return self.current

    def advance(self, **delta) -> None:
        from datetime import timedelta

        self.current += timedelta(**delta)


@pytest.fixture
def frozen_clock(monkeypatch):
    fake = FrozenClock(datetime(2026, 3, 2, 15, 0, tzinfo=UTC))
    monkeypatch.setattr(clock, "now", fake)
    return fake
