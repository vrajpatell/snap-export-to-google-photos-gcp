from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from app.adapters.google_photos.client import GooglePhotosClient
from app.domain.enums import FileStatus, JobStatus
from app.domain.interfaces import DedupeRepository, JobRepository, ManifestRepository
from app.models.job import ImportFileRecord, ImportJob, ImportJobCreate
from app.utils.files import compute_sha256, discover_files, safe_extract_zip
from app.utils.media import detect_mime_type, is_supported_media
from app.utils.timestamps import infer_timestamp


class ImportService:
    def __init__(
        self,
        jobs: JobRepository,
        manifests: ManifestRepository,
        dedupe: DedupeRepository,
        photos_client: GooglePhotosClient,
        workspace: Path,
    ) -> None:
        self.jobs = jobs
        self.manifests = manifests
        self.dedupe = dedupe
        self.photos_client = photos_client
        self.workspace = workspace
        self.workspace.mkdir(parents=True, exist_ok=True)

    def create_job(self, request: ImportJobCreate, uploaded_zip: Path | None = None) -> ImportJob:
        if uploaded_zip:
            source_uri = str(uploaded_zip)
            source_type = "zip"
        elif request.local_folder_path:
            source_uri = request.local_folder_path
            source_type = "folder"
        elif request.staged_path:
            source_uri = request.staged_path
            source_type = "staged"
        else:
            raise ValueError("one input source must be provided")

        job = ImportJob(
            source_uri=source_uri,
            source_type=source_type,
            dry_run=request.dry_run,
            skip_existing=request.skip_existing,
            force_reupload=request.force_reupload,
            album_strategy=request.album_strategy,
        )
        return self.jobs.create(job)

    def scan(self, job_id: str) -> ImportJob:
        job = self._get_job(job_id)
        job.status = JobStatus.SCANNING
        self._touch(job)

        source_dir = self._materialize_source(job)
        records: list[ImportFileRecord] = []
        for path in discover_files(source_dir):
            ts, ts_source = infer_timestamp(path, metadata_dir=source_dir / "metadata")
            mime = detect_mime_type(path)
            size = path.stat().st_size
            if not is_supported_media(path):
                records.append(
                    ImportFileRecord(
                        source_path=str(path),
                        original_filename=path.name,
                        mime_type=mime,
                        size_bytes=size,
                        sha256="",
                        timestamp_iso=ts.astimezone(timezone.utc).isoformat(),
                        timestamp_source=ts_source,
                        status=FileStatus.UNSUPPORTED,
                        error_reason="unsupported_extension",
                    )
                )
                continue

            records.append(
                ImportFileRecord(
                    source_path=str(path),
                    original_filename=path.name,
                    mime_type=mime,
                    size_bytes=size,
                    sha256=compute_sha256(path),
                    timestamp_iso=ts.astimezone(timezone.utc).isoformat(),
                    timestamp_source=ts_source,
                    status=FileStatus.PENDING,
                )
            )

        job.counters.total_discovered = len(records)
        job.counters.supported_files = sum(1 for r in records if r.status != FileStatus.UNSUPPORTED)
        job.counters.unsupported_count = sum(1 for r in records if r.status == FileStatus.UNSUPPORTED)
        self.manifests.save_records(job_id, records)
        job.status = JobStatus.READY
        self._touch(job)
        return job

    def start_upload(self, job_id: str) -> ImportJob:
        job = self._get_job(job_id)
        if job.status in (JobStatus.CANCELLED, JobStatus.COMPLETED):
            return job
        job.status = JobStatus.UPLOADING
        self._touch(job)

        records = self.manifests.load_records(job_id)
        for record in records:
            if record.status in (FileStatus.UNSUPPORTED, FileStatus.UPLOADED):
                continue
            if job.status == JobStatus.PAUSED:
                break
            dedupe_key = f"{record.sha256}:{record.size_bytes}:{record.timestamp_iso[:19]}"
            if job.skip_existing and not job.force_reupload and self.dedupe.exists(dedupe_key):
                record.status = FileStatus.DUPLICATE
                job.counters.skipped_duplicates += 1
                continue
            if job.dry_run:
                record.status = FileStatus.DISCOVERED
                continue
            try:
                file_bytes = Path(record.source_path).read_bytes()
                upload_token = self.photos_client.upload_bytes(file_bytes, record.original_filename)
                upload = self.photos_client.create_media_item(upload_token, description="Snapchat import")
                record.media_item_id = upload.media_item_id
                record.status = FileStatus.UPLOADED
                record.album_assigned = self._album_name(job.album_strategy, record.timestamp_iso, job.job_id)
                self.dedupe.put(dedupe_key, upload.media_item_id)
                job.counters.uploaded_count += 1
                job.counters.bytes_processed += record.size_bytes
            except Exception as exc:  # noqa: BLE001
                record.status = FileStatus.FAILED
                record.error_reason = str(exc)
                job.counters.failed_count += 1

        self.manifests.save_records(job_id, records)
        if job.status == JobStatus.PAUSED:
            self._touch(job)
            return job
        job.status = JobStatus.PARTIALLY_COMPLETED if job.counters.failed_count else JobStatus.COMPLETED
        self._touch(job)
        return job

    def pause(self, job_id: str) -> ImportJob:
        job = self._get_job(job_id)
        job.status = JobStatus.PAUSED
        self._touch(job)
        return job

    def resume(self, job_id: str) -> ImportJob:
        job = self._get_job(job_id)
        job.status = JobStatus.UPLOADING
        self._touch(job)
        return self.start_upload(job_id)

    def cancel(self, job_id: str) -> ImportJob:
        job = self._get_job(job_id)
        job.status = JobStatus.CANCELLED
        self._touch(job)
        return job

    def _materialize_source(self, job: ImportJob) -> Path:
        if job.source_type in ("folder", "staged"):
            return Path(job.source_uri)
        target = self.workspace / job.job_id / "extracted"
        safe_extract_zip(Path(job.source_uri), target)
        return target

    @staticmethod
    def _album_name(strategy: str, timestamp_iso: str, job_id: str) -> str:
        dt = datetime.fromisoformat(timestamp_iso)
        if strategy == "year":
            return f"Snapchat Import/{dt.year}"
        if strategy == "single_import":
            return f"Snapchat Import/{job_id}"
        return f"Snapchat Import/{dt.year}/{dt.year}-{dt.month:02d}"

    def _get_job(self, job_id: str) -> ImportJob:
        job = self.jobs.get(job_id)
        if not job:
            raise ValueError(f"job not found: {job_id}")
        return job

    def _touch(self, job: ImportJob) -> None:
        job.updated_at = datetime.now(timezone.utc)
        self.jobs.update(job)
