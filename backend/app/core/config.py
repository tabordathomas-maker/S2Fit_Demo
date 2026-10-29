"""Configuración de la aplicación leída desde variables de entorno (o backend/.env)."""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"

    # Base de datos (PostgreSQL de Supabase en producción).
    database_url: str = "postgresql+psycopg://postgres@localhost:54329/s2fit"

    # Supabase Auth: se usa para verificar los JWT emitidos a los usuarios.
    # SUPABASE_URL habilita la verificación con claves asimétricas (JWKS) y la
    # comprobación del emisor; SUPABASE_JWT_SECRET habilita tokens HS256 (legacy).
    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_jwt_audience: str = "authenticated"

    # Supabase Storage (solo backend). Nunca debe llegar al frontend.
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "product-images"

    # Orígenes permitidos para CORS, separados por comas.
    cors_origins: str = "http://localhost:5173"

    # Tiempo que se mantienen reservadas las existencias de un pedido pendiente.
    reservation_ttl_minutes: int = 2880

    # Límite de solicitudes por usuario y minuto en endpoints sensibles.
    rate_limit_per_minute: int = 10

    # Zona horaria del negocio (fechas de hábitos y retos).
    app_timezone: str = "America/Bogota"

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, value: str) -> str:
        # Supabase entrega URLs "postgresql://" o "postgres://"; SQLAlchemy necesita el driver.
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix):]
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def supabase_issuer(self) -> str | None:
        return f"{self.supabase_url.rstrip('/')}/auth/v1" if self.supabase_url else None


@lru_cache
def get_settings() -> Settings:
    return Settings()
