from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from app.models.job import TimestampSource


def parse_export_metadata_time(metadata_dir: Path, filename: str) -> datetime | None:
    metadata_file = metadata_dir / "memories_history.json"
    if not metadata_file.exists():
        return None
    try:
        data = json.loads(metadata_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    for item in data if isinstance(data, list) else []:
        if item.get("filename") == filename and item.get("capture_time"):
            return datetime.fromisoformat(item["capture_time"].replace("Z", "+00:00"))
    return None


def infer_timestamp(path: Path, metadata_dir: Path | None = None) -> tuple[datetime, TimestampSource]:
    if metadata_dir:
        by_export = parse_export_metadata_time(metadata_dir, path.name)
        if by_export:
            return by_export, "export_metadata"
    # EXIF parsing is intentionally omitted to keep dependencies light; could be added via pillow/exifread.
    stat = path.stat()
    return datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc), "file_mtime"
