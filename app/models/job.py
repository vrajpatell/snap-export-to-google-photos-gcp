from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field

from app.domain.enums import FileStatus, JobStatus

AlbumStrategy = Literal["year", "year_month", "single_import"]
TimestampSource = Literal["export_metadata", "media_metadata", "file_mtime", "unknown"]


class JobCounters(BaseModel):
    total_discovered: int = 0
    supported_files: int = 0
    uploaded_count: int = 0
    skipped_duplicates: int = 0
    failed_count: int = 0
    unsupported_count: int = 0
    bytes_processed: int = 0


class ImportFileRecord(BaseModel):
    file_id: str = Field(default_factory=lambda: str(uuid4()))
    source_path: str
    original_filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    timestamp_iso: str
    timestamp_source: TimestampSource = "unknown"
    status: FileStatus = FileStatus.DISCOVERED
    error_reason: str | None = None
    media_item_id: str | None = None
    album_assigned: str | None = None


class ImportJob(BaseModel):
    job_id: str = Field(default_factory=lambda: str(uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    status: JobStatus = JobStatus.QUEUED
    source_uri: str
    source_type: Literal["zip", "folder", "staged"] = "zip"
    dry_run: bool = False
    skip_existing: bool = True
    force_reupload: bool = False
    album_strategy: AlbumStrategy = "year_month"
    counters: JobCounters = Field(default_factory=JobCounters)
    manifest_path: str | None = None
    report_json_path: str | None = None
    report_csv_path: str | None = None


class ImportJobCreate(BaseModel):
    staged_path: str | None = None
    local_folder_path: str | None = None
    dry_run: bool = False
    skip_existing: bool = True
    force_reupload: bool = False
    album_strategy: AlbumStrategy = "year_month"


class JobActionResponse(BaseModel):
    job_id: str
    status: JobStatus
    message: str
