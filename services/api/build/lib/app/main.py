"""FastAPI application: middleware, structured error handling, routers, lifespan.

On startup the configuration is loaded (fail-fast). For a zero-Postgres local
run against SQLite, tables are created automatically; Postgres uses Alembic.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .config import get_settings
from .config_loader import get_config
from .db import Base, engine
from .errors import AppError, error_envelope
from .logging import configure_logging, get_request_id, logger, new_request_id, set_request_id
from .routers import configuration, health, journeys


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    settings = get_settings()
    # Fail fast if the frozen configuration is invalid.
    cfg = get_config(force_reload=True)
    logger.info("loaded configuration v%s with %d journeys", cfg.version, len(cfg.journeys))
    # SQLite convenience: create schema without Alembic. Postgres uses migrations.
    if settings.is_sqlite:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Billbeak Let's Talk API",
        version=__version__,
        description="Generic, configuration-driven backend for the Billbeak 'Let's Talk' experience.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[settings.request_id_header],
    )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        header = settings.request_id_header
        rid = request.headers.get(header) or new_request_id()
        set_request_id(rid)
        response = await call_next(request)
        response.headers[header] = rid
        return response

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code,
            content=error_envelope(exc.code, exc.message, get_request_id(), exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation(request: Request, exc: RequestValidationError):
        details = [
            {"field": ".".join(str(p) for p in e.get("loc", [])), "rule": e.get("type"), "message": e.get("msg")}
            for e in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=error_envelope("request_validation_error", "Invalid request.", get_request_id(), details),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception):
        logger.exception("unhandled error: %s", exc)
        return JSONResponse(
            status_code=500,
            content=error_envelope("internal_error", "An unexpected error occurred.", get_request_id()),
        )

    app.include_router(health.router)
    app.include_router(configuration.router)
    app.include_router(journeys.router)
    return app


app = create_app()
