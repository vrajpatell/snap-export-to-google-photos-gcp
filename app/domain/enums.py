from __future__ import annotations

from enum import StrEnum


class JobStatus(StrEnum):
    QUEUED = "queued"
    SCANNING = "scanning"
    READY = "ready"
    UPLOADING = "uploading"
    PAUSED = "paused"
    COMPLETED = "completed"
    PARTIALLY_COMPLETED = "partially_completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class FileStatus(StrEnum):
    DISCOVERED = "discovered"
    UNSUPPORTED = "unsupported"
    DUPLICATE = "duplicate"
    UPLOADED = "uploaded"
    FAILED = "failed"
    PENDING = "pending"
