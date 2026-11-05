import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("s2fit")


class AppError(Exception):
    """Error de negocio con un mensaje apto para mostrar al usuario."""

    def __init__(self, status_code: int, code: str, message: str, details: dict | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}


def not_found(message: str = "Recurso no encontrado.") -> AppError:
    return AppError(404, "not_found", message)


def conflict(code: str, message: str, details: dict | None = None) -> AppError:
    return AppError(409, code, message, details)


def resource_in_use(message: str, details: dict | None = None) -> AppError:
    """409 estándar al eliminar algo que otros registros todavía referencian."""
    return AppError(409, "RESOURCE_IN_USE", message, details)


def forbidden(code: str = "forbidden", message: str = "No tienes permiso para esta acción.") -> AppError:
    return AppError(403, code, message)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [
            {"field": ".".join(str(p) for p in err["loc"][1:]), "message": err["msg"]}
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "Los datos enviados no son válidos.",
                    "details": {"fields": fields},
                }
            },
        )

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception) -> JSONResponse:
        # Se registra el detalle en el servidor, pero nunca se envía al cliente.
        logger.exception("Error no controlado", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "internal_error", "message": "Ocurrió un error interno. Intenta de nuevo.", "details": {}}},
        )
