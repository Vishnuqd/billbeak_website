"""Database layer: portable column types, engine, session factory, Base.

Column types are portable so the same models run on PostgreSQL (production /
Alembic) and SQLite (hermetic tests): GUID -> native UUID on PG, CHAR(32) hex
elsewhere; JSONVariant -> JSONB on PG, JSON elsewhere.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import CHAR, JSON, DateTime, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from .config import get_settings

settings = get_settings()


class GUID(TypeDecorator):
    """Platform-independent UUID: PG native UUID, else CHAR(32) hex."""

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PGUUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(32))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if not isinstance(value, uuid.UUID):
            value = uuid.UUID(str(value))
        if dialect.name == "postgresql":
            return value
        return value.hex

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)


# JSONB on PostgreSQL, generic JSON everywhere else.
JSONVariant = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSONVariant, list[Any]: JSONVariant}


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


# ---------------------------------------------------------------------------
# Engine / session
# ---------------------------------------------------------------------------

_connect_args: dict[str, Any] = {}
# Managed Postgres (e.g. Neon) requires TLS. asyncpg takes ssl via connect_args.
# Enabled by DB_SSL=true in production; left off for local Postgres/SQLite.
if settings.db_ssl and not settings.is_sqlite:
    _connect_args["ssl"] = True
engine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
    pool_pre_ping=not settings.is_sqlite,
    connect_args=_connect_args,
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


if settings.is_sqlite:
    # Enforce foreign keys on SQLite (off by default).
    from sqlalchemy import Engine as _SyncEngine  # noqa: F401

    @event.listens_for(engine.sync_engine, "connect")
    def _fk_pragma(dbapi_connection, _record):  # pragma: no cover - trivial
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


async def get_session() -> AsyncSession:  # FastAPI dependency
    async with SessionLocal() as session:
        yield session
