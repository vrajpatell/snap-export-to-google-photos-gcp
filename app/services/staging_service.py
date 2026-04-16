from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from google.cloud import storage

from app.config.settings import settings
from app.utils.files import safe_extract_zip

_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


@dataclass
class StagingUploadUrl:
    upload_url: str
    object_path: str
    method: str
    required_headers: dict[str, str]
    expires_at: datetime


class StagingService:
    def __init__(self, workspace: Path) -> None:
        self.workspace = workspace
        self.workspace.mkdir(parents=True, exist_ok=True)
        self._storage_client: storage.Client | None = None

    def create_upload_url(
        self, filename: str, content_type: str, size_bytes: int
    ) -> StagingUploadUrl:
        sanitized = self._sanitize_filename(filename)
        self.validate_upload(content_type, size_bytes)
        object_path = f"uploads/{datetime.now(UTC).strftime('%Y/%m/%d')}/{uuid.uuid4()}-{sanitized}"
        expires_at = datetime.now(UTC) + timedelta(seconds=settings.staging_signed_url_ttl_seconds)

        if settings.use_gcp_backends:
            if not settings.gcs_staging_bucket:
                raise ValueError("gcs staging bucket is not configured")
            blob = self._bucket().blob(object_path)
            upload_url = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(seconds=settings.staging_signed_url_ttl_seconds),
                method="PUT",
                content_type=content_type,
            )
            return StagingUploadUrl(
                upload_url=upload_url,
                object_path=object_path,
                method="PUT",
                required_headers={"Content-Type": content_type},
                expires_at=expires_at,
            )

        local_path = self.workspace / "staging" / object_path
        local_path.parent.mkdir(parents=True, exist_ok=True)
        return StagingUploadUrl(
            upload_url=f"/staging/local-upload/{object_path}",
            object_path=object_path,
            method="PUT",
            required_headers={"Content-Type": content_type},
            expires_at=expires_at,
        )

    def complete(self, object_path: str, expected_size_bytes: int) -> str:
        if not object_path.startswith("uploads/"):
            raise ValueError("invalid staged object path")
        if expected_size_bytes <= 0:
            raise ValueError("invalid expected size")

        if settings.use_gcp_backends:
            blob = self._bucket().blob(object_path)
            if not blob.exists():
                raise ValueError("staged object does not exist")
            blob.reload()
            if int(blob.size or 0) != expected_size_bytes:
                raise ValueError("staged object size mismatch")
            return f"gcs://{settings.gcs_staging_bucket}/{object_path}"

        local_path = self.workspace / "staging" / object_path
        if not local_path.exists():
            raise ValueError("staged object does not exist")
        if local_path.stat().st_size != expected_size_bytes:
            raise ValueError("staged object size mismatch")
        return f"local://{object_path}"

    def materialize_staged_source(self, source_uri: str, target_root: Path) -> Path:
        download_path = target_root / "source.zip"
        target_root.mkdir(parents=True, exist_ok=True)
        if source_uri.startswith("gcs://"):
            bucket, object_path = self._parse_gcs_uri(source_uri)
            if not object_path.lower().endswith(".zip"):
                raise ValueError("staged gcs object must be a .zip file")
            blob = self._bucket(bucket).blob(object_path)
            if not blob.exists():
                raise ValueError("staged source object no longer exists")
            blob.download_to_filename(str(download_path))
        elif source_uri.startswith("local://"):
            object_path = source_uri.replace("local://", "", 1)
            local_path = self.workspace / "staging" / object_path
            if not local_path.exists():
                raise ValueError("staged source file no longer exists")
            download_path.write_bytes(local_path.read_bytes())
        else:
            raise ValueError("unsupported staged source uri")

        extracted = target_root / "extracted"
        safe_extract_zip(download_path, extracted)
        return extracted

    def write_local_upload_chunk(self, object_path: str, body: bytes, content_type: str) -> int:
        if settings.use_gcp_backends:
            raise ValueError("local upload endpoint is unavailable")
        if not object_path.startswith("uploads/"):
            raise ValueError("invalid staged object path")
        self.validate_upload(content_type=content_type, size_bytes=len(body))
        path = self.workspace / "staging" / object_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        return len(body)

    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        safe = _SAFE_FILENAME.sub("_", Path(filename).name)
        if not safe:
            raise ValueError("invalid filename")
        return safe

    @staticmethod
    def validate_upload(content_type: str, size_bytes: int) -> None:
        if content_type not in settings.staging_allowed_content_types_list:
            raise ValueError("content type is not allowed")
        if size_bytes <= 0:
            raise ValueError("file size must be greater than zero")
        max_bytes = settings.max_staged_upload_size_mb * 1024 * 1024
        if size_bytes > max_bytes:
            raise ValueError("file exceeds staged upload size limit")

    def _bucket(self, bucket_name: str | None = None) -> storage.Bucket:
        if not self._storage_client:
            self._storage_client = storage.Client(project=settings.gcp_project_id or None)
        return self._storage_client.bucket(bucket_name or settings.gcs_staging_bucket)

    @staticmethod
    def _parse_gcs_uri(source_uri: str) -> tuple[str, str]:
        without_scheme = source_uri.replace("gcs://", "", 1)
        pieces = without_scheme.split("/", 1)
        if len(pieces) != 2:
            raise ValueError("invalid staged gcs uri")
        return pieces[0], pieces[1]
