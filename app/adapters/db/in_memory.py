from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.interfaces import DedupeRepository, JobRepository, ManifestRepository
from app.models.job import ImportFileRecord, ImportJob


@dataclass
class InMemoryJobRepository(JobRepository):
    _jobs: dict[str, ImportJob] = field(default_factory=dict)

    def create(self, job: ImportJob) -> ImportJob:
        self._jobs[job.job_id] = job
        return job

    def get(self, job_id: str) -> ImportJob | None:
        return self._jobs.get(job_id)

    def list(self) -> list[ImportJob]:
        return list(self._jobs.values())

    def update(self, job: ImportJob) -> ImportJob:
        self._jobs[job.job_id] = job
        return job


@dataclass
class InMemoryManifestRepository(ManifestRepository):
    _records: dict[str, list[ImportFileRecord]] = field(default_factory=dict)

    def save_records(self, job_id: str, records: list[ImportFileRecord]) -> None:
        self._records[job_id] = records

    def load_records(self, job_id: str) -> list[ImportFileRecord]:
        return self._records.get(job_id, [])


@dataclass
class InMemoryDedupeRepository(DedupeRepository):
    _index: dict[str, str] = field(default_factory=dict)

    def exists(self, key: str) -> bool:
        return key in self._index

    def put(self, key: str, media_item_id: str) -> None:
        self._index[key] = media_item_id
