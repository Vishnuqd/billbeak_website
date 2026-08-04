"""Application settings, loaded from environment with safe local defaults."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_config_dir() -> Path:
    # services/api/app/config.py -> parents[3] == repo root
    return Path(__file__).resolve().parents[3] / "config" / "conversations"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+asyncpg://billbeak:billbeak@localhost:5432/billbeak"
    # Require TLS to the database (set true for managed Postgres like Neon).
    db_ssl: bool = False

    config_dir: Path = Field(default_factory=_default_config_dir)

    # Uploads
    upload_provider: str = "local"
    upload_dir: Path = Path("./uploads")
    upload_bucket: str | None = None
    upload_s3_endpoint: str | None = None
    upload_s3_region: str | None = None
    upload_max_mb: int = 10

    # Email / CRM (queue + adapter only in this phase)
    email_provider: str = "log"
    crm_provider: str = "none"

    cors_origins: str = "http://localhost:5173,http://localhost:4173"
    request_id_header: str = "X-Request-ID"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()
