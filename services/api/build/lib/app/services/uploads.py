"""Upload provider abstraction.

Business logic never depends on the storage backend. `local` is fully
implemented and is the default. `s3` / `r2` use boto3 (lazy import) and real
credentials; they are selected by configuration. The backend always stores the
metadata regardless of provider.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from ..config import Settings
from ..errors import ConfigError


@dataclass
class StoredObject:
    provider: str
    object_key: str
    url: str | None
    size_bytes: int
    sha256: str


class UploadProvider(Protocol):
    name: str

    def save(self, *, journey_id: str, filename: str, content_type: str, data: bytes) -> StoredObject:
        ...


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _safe_name(filename: str) -> str:
    base = Path(filename).name
    return f"{uuid.uuid4().hex}_{base}"


class LocalUploadProvider:
    name = "local"

    def __init__(self, base_dir: Path):
        self.base_dir = Path(base_dir)

    def save(self, *, journey_id: str, filename: str, content_type: str, data: bytes) -> StoredObject:
        key = f"{journey_id}/{_safe_name(filename)}"
        path = self.base_dir / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return StoredObject(
            provider=self.name,
            object_key=key,
            url=str(path.resolve()),
            size_bytes=len(data),
            sha256=_sha256(data),
        )


class S3UploadProvider:
    """S3 / Cloudflare R2 (R2 = S3 API with a custom endpoint). Requires boto3 + creds."""

    def __init__(self, settings: Settings, name: str = "s3"):
        self.name = name
        self.settings = settings
        if not settings.upload_bucket:
            raise ConfigError(f"UPLOAD_BUCKET is required for the '{name}' upload provider.")

    def _client(self):  # pragma: no cover - requires boto3 + network
        try:
            import boto3  # lazy import; optional dependency
        except ImportError as exc:
            raise ConfigError("boto3 is required for S3/R2 uploads (pip install boto3).") from exc
        return boto3.client(
            "s3",
            endpoint_url=self.settings.upload_s3_endpoint,
            region_name=self.settings.upload_s3_region,
        )

    def save(self, *, journey_id: str, filename: str, content_type: str, data: bytes) -> StoredObject:  # pragma: no cover
        key = f"{journey_id}/{_safe_name(filename)}"
        self._client().put_object(
            Bucket=self.settings.upload_bucket,
            Key=key,
            Body=data,
            ContentType=content_type or "application/octet-stream",
        )
        return StoredObject(
            provider=self.name,
            object_key=key,
            url=None,  # private bucket; downloads via presigned URL later
            size_bytes=len(data),
            sha256=_sha256(data),
        )


def get_upload_provider(settings: Settings) -> UploadProvider:
    provider = settings.upload_provider.lower()
    if provider == "local":
        return LocalUploadProvider(settings.upload_dir)
    if provider == "s3":
        return S3UploadProvider(settings, name="s3")
    if provider == "r2":
        return S3UploadProvider(settings, name="r2")
    raise ConfigError(f"Unknown UPLOAD_PROVIDER '{settings.upload_provider}'.")
