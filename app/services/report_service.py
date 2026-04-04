from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

from app.models.job import ImportFileRecord, ImportJob
from app.utils.files import write_csv, write_json


@dataclass
class ReportPaths:
    json_path: str
    csv_path: str


class ReportService:
    def __init__(self, output_dir: Path) -> None:
        self.output_dir = output_dir

    def build(self, job: ImportJob, records: list[ImportFileRecord]) -> ReportPaths:
        payload = {
            "job_id": job.job_id,
            "status": job.status,
            "counters": job.counters.model_dump(),
            "files": [record.model_dump() for record in records],
        }
        rows = [asdict(self._csv_row(record)) for record in records]
        json_path = self.output_dir / f"{job.job_id}-report.json"
        csv_path = self.output_dir / f"{job.job_id}-report.csv"
        write_json(json_path, payload)
        write_csv(csv_path, rows)
        return ReportPaths(json_path=str(json_path), csv_path=str(csv_path))

    @dataclass
    class _csv_row:
        source_path: str
        status: str
        error_reason: str | None
        media_item_id: str | None
        album_assigned: str | None
        timestamp_source: str

        def __init__(self, record: ImportFileRecord) -> None:
            self.source_path = record.source_path
            self.status = record.status.value
            self.error_reason = record.error_reason
            self.media_item_id = record.media_item_id
            self.album_assigned = record.album_assigned
            self.timestamp_source = record.timestamp_source
