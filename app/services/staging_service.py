from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

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
        self._s3_client = None

    def create_upload_url(
        self, filename: str, content_type: str, size_bytes: int
    ) -> StagingUploadUrl:
        sanitized = self._sanitize_filename(filename)
        self.validate_upload(content_type, size_bytes)
        object_path = f"uploads/{datetime.now(UTC).strftime('%Y/%m/%d')}/{uuid.uuid4()}-{sanitized}"
        expires_at = datetime.now(UTC) + timedelta(seconds=settings.staging_signed_url_ttl_seconds)

        if settings.storage_backend == "s3":
            if not settings.s3_staging_bucket:
                raise ValueError("S3_STAGING_BUCKET is required for s3 staging")
            upload_url = self._s3().generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": settings.s3_staging_bucket,
                    "Key": object_path,
                    "ContentType": content_type,
                },
                ExpiresIn=settings.staging_signed_url_ttl_seconds,
                HttpMethod="PUT",
            )
            return StagingUploadUrl(
                upload_url, object_path, "PUT", {"Content-Type": content_type}, expires_at
            )

        local_path = self.workspace / "staging" / object_path
        local_path.parent.mkdir(parents=True, exist_ok=True)
        return StagingUploadUrl(
            f"/staging/local-upload/{object_path}",
            object_path,
            "PUT",
            {"Content-Type": content_type},
            expires_at,
        )

    def complete(self, object_path: str, expected_size_bytes: int) -> str:
        if not object_path.startswith("uploads/"):
            raise ValueError("invalid staged object path")
        if expected_size_bytes <= 0:
            raise ValueError("invalid expected size")
        if settings.storage_backend == "s3":
            try:
                head = self._s3().head_object(Bucket=settings.s3_staging_bucket, Key=object_path)
            except Exception as exc:  # noqa: BLE001
                raise ValueError("staged object does not exist") from exc
            if int(head.get("ContentLength", 0)) != expected_size_bytes:
                raise ValueError("staged object size mismatch")
            return f"s3://{settings.s3_staging_bucket}/{object_path}"

        local_path = self.workspace / "staging" / object_path
        if not local_path.exists():
            raise ValueError("staged object does not exist")
        if local_path.stat().st_size != expected_size_bytes:
            raise ValueError("staged object size mismatch")
        return f"local://{object_path}"

    def materialize_staged_source(self, source_uri: str, target_root: Path) -> Path:
        download_path = target_root / "source.zip"
        target_root.mkdir(parents=True, exist_ok=True)
        if source_uri.startswith("s3://"):
            bucket, object_path = self._parse_object_uri(source_uri, "s3://")
            if not object_path.lower().endswith(".zip"):
                raise ValueError("staged object must be a .zip file")
            self._s3().download_file(bucket, object_path, str(download_path))
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
        if settings.storage_backend != "local":
            raise ValueError("local upload endpoint is unavailable for configured storage backend")
        if not object_path.startswith("uploads/"):
            raise ValueError("invalid staged object path")
        self.validate_upload(content_type=content_type, size_bytes=len(body))
        path = self.workspace / "staging" / object_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        return len(body)

    def _s3(self):  # type: ignore[no-untyped-def]
        if self._s3_client is None:
            import boto3
            from botocore.client import Config

            kwargs: dict[str, object] = {
                "region_name": settings.s3_region,
                "config": Config(signature_version="s3v4"),
            }
            if settings.s3_endpoint_url:
                kwargs["endpoint_url"] = settings.s3_endpoint_url
            if settings.s3_access_key_id and settings.s3_secret_access_key:
                kwargs["aws_access_key_id"] = settings.s3_access_key_id
                kwargs["aws_secret_access_key"] = settings.s3_secret_access_key
            self._s3_client = boto3.client("s3", **kwargs)
        return self._s3_client

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
        if size_bytes > settings.max_staged_upload_size_mb * 1024 * 1024:
            raise ValueError("file exceeds staged upload size limit")

    @staticmethod
    def _parse_object_uri(source_uri: str, scheme: str) -> tuple[str, str]:
        pieces = source_uri.replace(scheme, "", 1).split("/", 1)
        if len(pieces) != 2:
            raise ValueError("invalid staged object uri")
        return pieces[0], pieces[1]
