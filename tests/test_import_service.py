from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from app.adapters.db.in_memory import (
    InMemoryDedupeRepository,
    InMemoryJobRepository,
    InMemoryManifestRepository,
)
from app.adapters.google_photos.client import UploadResult
from app.models.job import ImportJobCreate
from app.services.import_service import ImportService


class FakePhotosClient:
    def upload_bytes(self, content: bytes, filename: str) -> str:
        return f"token-{filename}-{len(content)}"

    def create_media_item(self, upload_token: str, description: str = "") -> UploadResult:
        return UploadResult(media_item_id=f"id-{upload_token}", uploaded_at=datetime.now(UTC))


def test_resume_behavior(sample_export: Path, tmp_path: Path) -> None:
    svc = ImportService(
        InMemoryJobRepository(),
        InMemoryManifestRepository(),
        InMemoryDedupeRepository(),
        FakePhotosClient(),
        workspace=tmp_path,
    )
    job = svc.create_job(ImportJobCreate(local_folder_path=str(sample_export), dry_run=False))
    svc.scan(job.job_id)
    svc.pause(job.job_id)
    resumed = svc.resume(job.job_id)
    assert resumed.status.value in {"completed", "partially_completed"}


def test_job_state_transitions(sample_export: Path, tmp_path: Path) -> None:
    svc = ImportService(
        InMemoryJobRepository(),
        InMemoryManifestRepository(),
        InMemoryDedupeRepository(),
        FakePhotosClient(),
        workspace=tmp_path,
    )
    job = svc.create_job(ImportJobCreate(local_folder_path=str(sample_export)))
    scanned = svc.scan(job.job_id)
    assert scanned.status.value == "ready"
    started = svc.start_upload(job.job_id)
    assert started.status.value in {"completed", "partially_completed"}
