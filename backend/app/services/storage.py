"""Subida de imágenes y videos a Supabase Storage con la clave service_role (solo backend)."""

import secrets

import httpx

from app.core.config import get_settings
from app.core.errors import AppError

IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
VIDEO_TYPES = {"video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov"}

MAX_IMAGE_BYTES = 5 * 1024 * 1024
# El plan gratuito de Supabase admite archivos de hasta 50 MB.
MAX_VIDEO_BYTES = 50 * 1024 * 1024

# Compatibilidad con el nombre anterior.
ALLOWED_TYPES = IMAGE_TYPES
MAX_BYTES = MAX_IMAGE_BYTES


def _upload(content: bytes, content_type: str, folder: str, extension: str) -> str:
    settings = get_settings()
    base = settings.supabase_url.rstrip("/")
    bucket = settings.supabase_storage_bucket
    path = f"{folder}/{secrets.token_hex(12)}.{extension}"
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
            timeout=120,
        )
    except httpx.HTTPError as exc:
        raise AppError(502, "storage_error", "No se pudo subir el archivo. Intenta de nuevo.") from exc
    if response.status_code == 413:
        raise AppError(422, "file_too_large", "Supabase rechazó el archivo por tamaño.")
    if response.status_code >= 400:
        raise AppError(502, "storage_error", "No se pudo subir el archivo. Revisa que el bucket exista y sea público.")
    return f"{base}/storage/v1/object/public/{bucket}/{path}"


def _ensure_configured() -> None:
    settings = get_settings()
    if not (settings.supabase_url and settings.supabase_service_role_key):
        raise AppError(
            503,
            "storage_not_configured",
            "El almacenamiento no está configurado: falta SUPABASE_SERVICE_ROLE_KEY en el backend.",
        )


def upload_product_image(content: bytes, content_type: str) -> str:
    _ensure_configured()
    extension = IMAGE_TYPES.get(content_type)
    if extension is None:
        raise AppError(422, "invalid_file_type", "Solo se permiten imágenes JPG, PNG o WEBP.")
    if len(content) > MAX_IMAGE_BYTES:
        raise AppError(422, "file_too_large", "La imagen no puede superar 5 MB.")
    return _upload(content, content_type, "products", extension)


def upload_content_media(content: bytes, content_type: str) -> tuple[str, str]:
    """Sube una imagen o un video de Mi Ruta / S2 Plus. Devuelve (url, "image" | "video")."""
    _ensure_configured()
    if content_type in IMAGE_TYPES:
        if len(content) > MAX_IMAGE_BYTES:
            raise AppError(422, "file_too_large", "La imagen no puede superar 5 MB.")
        return _upload(content, content_type, "content/images", IMAGE_TYPES[content_type]), "image"
    if content_type in VIDEO_TYPES:
        if len(content) > MAX_VIDEO_BYTES:
            raise AppError(
                422, "file_too_large",
                "El video no puede superar 50 MB. Para videos más largos súbelo a YouTube (oculto) y pega el enlace.",
            )
        return _upload(content, content_type, "content/videos", VIDEO_TYPES[content_type]), "video"
    raise AppError(422, "invalid_file_type", "Solo se permiten imágenes JPG, PNG o WEBP y videos MP4, WEBM o MOV.")
