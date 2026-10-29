"""Subida de imágenes de productos a Supabase Storage usando la clave service_role (solo backend)."""

import secrets

import httpx

from app.core.config import get_settings
from app.core.errors import AppError

ALLOWED_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_BYTES = 3 * 1024 * 1024


def upload_product_image(content: bytes, content_type: str) -> str:
    settings = get_settings()
    if not (settings.supabase_url and settings.supabase_service_role_key):
        raise AppError(503, "storage_not_configured", "El almacenamiento de imágenes no está configurado.")
    extension = ALLOWED_TYPES.get(content_type)
    if extension is None:
        raise AppError(422, "invalid_file_type", "Solo se permiten imágenes JPG, PNG o WEBP.")
    if len(content) > MAX_BYTES:
        raise AppError(422, "file_too_large", "La imagen no puede superar 3 MB.")

    base = settings.supabase_url.rstrip("/")
    bucket = settings.supabase_storage_bucket
    path = f"products/{secrets.token_hex(12)}.{extension}"
    try:
        response = httpx.post(
            f"{base}/storage/v1/object/{bucket}/{path}",
            content=content,
            headers={
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "apikey": settings.supabase_service_role_key,
                "Content-Type": content_type,
                "x-upsert": "false",
            },
            timeout=20,
        )
    except httpx.HTTPError as exc:
        raise AppError(502, "storage_error", "No se pudo subir la imagen. Intenta de nuevo.") from exc
    if response.status_code >= 400:
        raise AppError(502, "storage_error", "No se pudo subir la imagen. Intenta de nuevo.")
    return f"{base}/storage/v1/object/public/{bucket}/{path}"
