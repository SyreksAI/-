"""Media blob storage — PostgreSQL holds metadata only; bytes live here (local disk or MinIO)."""
from __future__ import annotations

import logging
import tempfile
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Iterator

from app.config import settings

logger = logging.getLogger(__name__)


class MediaStorage(ABC):
    """Unified interface for photo/video/file blobs."""

    @abstractmethod
    def generate_key(self, ext: str) -> str: ...

    @abstractmethod
    def thumb_key_for(self, storage_key: str) -> str: ...

    @abstractmethod
    def put_bytes(self, key: str, data: bytes) -> None: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def get_size(self, key: str) -> int: ...

    @abstractmethod
    def etag(self, key: str) -> str: ...

    @abstractmethod
    def iter_bytes(self, key: str, start: int, end: int) -> Iterator[bytes]: ...

    def write_temp(self, data: bytes, suffix: str = ".bin") -> Path:
        """Local temp file for ffmpeg/PIL processing (not stored in DB)."""
        handle = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        try:
            handle.write(data)
        finally:
            handle.close()
        return Path(handle.name)

    def temp_thumb_path(self) -> Path:
        handle = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
        handle.close()
        return Path(handle.name)


class LocalMediaStorage(MediaStorage):
    @property
    def root(self) -> Path:
        return Path(settings.UPLOAD_DIR)

    def _dated_dir(self, when: datetime | None = None) -> Path:
        when = when or datetime.now(timezone.utc)
        path = self.root / f"{when:%Y}" / f"{when:%m}"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def absolute_path(self, storage_key: str) -> Path:
        resolved = (self.root / storage_key).resolve()
        root = self.root.resolve()
        if not str(resolved).startswith(str(root)):
            raise ValueError("Invalid storage key")
        return resolved

    def generate_key(self, ext: str) -> str:
        ext = ext if ext.startswith(".") else f".{ext}"
        ext = ext.lower()
        file_id = uuid.uuid4().hex
        directory = self._dated_dir()
        relative = directory.relative_to(self.root) / f"{file_id}{ext}"
        return str(relative).replace("\\", "/")

    def thumb_key_for(self, storage_key: str) -> str:
        parts = Path(storage_key)
        return str(parts.parent / "thumbs" / f"{parts.stem}.jpg").replace("\\", "/")

    def put_bytes(self, key: str, data: bytes) -> None:
        path = self.absolute_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def exists(self, key: str) -> bool:
        return self.absolute_path(key).is_file()

    def get_size(self, key: str) -> int:
        return self.absolute_path(key).stat().st_size

    def etag(self, key: str) -> str:
        stat = self.absolute_path(key).stat()
        return f'"{stat.st_mtime_ns}-{stat.st_size}"'

    def iter_bytes(self, key: str, start: int, end: int) -> Iterator[bytes]:
        chunk = 1024 * 256
        with self.absolute_path(key).open("rb") as handle:
            handle.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                data = handle.read(min(chunk, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data


class MinioMediaStorage(MediaStorage):
    """S3-compatible object storage for media (MinIO). Metadata stays in PostgreSQL."""

    def __init__(self) -> None:
        self.bucket = settings.MINIO_BUCKET
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from minio import Minio

            self._client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE,
            )
            self._ensure_bucket()
        return self._client

    def _ensure_bucket(self) -> None:
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    def generate_key(self, ext: str) -> str:
        ext = ext if ext.startswith(".") else f".{ext}"
        ext = ext.lower()
        when = datetime.now(timezone.utc)
        file_id = uuid.uuid4().hex
        return f"{when:%Y}/{when:%m}/{file_id}{ext}"

    def thumb_key_for(self, storage_key: str) -> str:
        parts = Path(storage_key)
        return str(parts.parent / "thumbs" / f"{parts.stem}.jpg").replace("\\", "/")

    def put_bytes(self, key: str, data: bytes) -> None:
        self.client.put_object(
            self.bucket,
            key,
            BytesIO(data),
            length=len(data),
        )

    def exists(self, key: str) -> bool:
        try:
            self.client.stat_object(self.bucket, key)
            return True
        except Exception:
            return False

    def get_size(self, key: str) -> int:
        return self.client.stat_object(self.bucket, key).size

    def etag(self, key: str) -> str:
        stat = self.client.stat_object(self.bucket, key)
        tag = stat.etag or f"{stat.last_modified}-{stat.size}"
        return f'"{tag}"'

    def iter_bytes(self, key: str, start: int, end: int) -> Iterator[bytes]:
        chunk = 1024 * 256
        length = end - start + 1
        response = self.client.get_object(self.bucket, key, offset=start, length=length)
        try:
            while True:
                data = response.read(chunk)
                if not data:
                    break
                yield data
        finally:
            response.close()
            response.release_conn()


class FallbackMediaStorage(MediaStorage):
    """MinIO primary; fallback to local uploads/ when object missing or MinIO unavailable."""

    def __init__(self) -> None:
        self._primary: MinioMediaStorage | None = None
        self.fallback = LocalMediaStorage()

    @property
    def primary(self) -> MinioMediaStorage:
        if self._primary is None:
            self._primary = MinioMediaStorage()
        return self._primary

    def _resolve(self, key: str) -> MediaStorage:
        try:
            if self.primary.exists(key):
                return self.primary
        except Exception as exc:
            logger.warning("MinIO read failed, using local fallback: %s", exc)
        if self.fallback.exists(key):
            return self.fallback
        return self.primary

    def generate_key(self, ext: str) -> str:
        return self.primary.generate_key(ext)

    def thumb_key_for(self, storage_key: str) -> str:
        return self.primary.thumb_key_for(storage_key)

    def put_bytes(self, key: str, data: bytes) -> None:
        try:
            self.primary.put_bytes(key, data)
        except Exception as exc:
            logger.warning("MinIO write failed, storing locally: %s", exc)
            self.fallback.put_bytes(key, data)

    def exists(self, key: str) -> bool:
        try:
            if self.primary.exists(key):
                return True
        except Exception:
            pass
        return self.fallback.exists(key)

    def get_size(self, key: str) -> int:
        return self._resolve(key).get_size(key)

    def etag(self, key: str) -> str:
        return self._resolve(key).etag(key)

    def iter_bytes(self, key: str, start: int, end: int) -> Iterator[bytes]:
        return self._resolve(key).iter_bytes(key, start, end)


_storage: MediaStorage | None = None


def get_media_storage() -> MediaStorage:
    global _storage
    if _storage is None:
        backend = (settings.MEDIA_STORAGE or "local").lower()
        if backend == "minio":
            _storage = FallbackMediaStorage()
        else:
            _storage = LocalMediaStorage()
    return _storage


class _StorageProxy:
    """Lazy proxy so tests can switch MEDIA_STORAGE before first use."""

    def __getattr__(self, name: str):
        return getattr(get_media_storage(), name)


def reset_media_storage() -> None:
    global _storage
    _storage = None


storage = _StorageProxy()
