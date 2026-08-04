"""Structured application errors and a consistent JSON envelope."""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base for all handled application errors."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str, *, details: list[dict[str, Any]] | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or []


class BadRequestError(AppError):
    status_code = 400
    code = "bad_request"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class ConfigError(AppError):
    """Raised when the business configuration is invalid. Fails fast at startup."""

    status_code = 500
    code = "configuration_error"


def error_envelope(code: str, message: str, request_id: str, details: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or [],
            "requestId": request_id,
        }
    }
