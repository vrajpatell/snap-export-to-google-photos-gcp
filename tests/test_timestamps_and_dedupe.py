from __future__ import annotations

from pathlib import Path

from app.adapters.db.in_memory import InMemoryDedupeRepository
from app.utils.files import compute_sha256
from app.utils.timestamps import infer_timestamp


def test_timestamp_prefers_export_metadata(sample_export: Path) -> None:
    ts, source = infer_timestamp(
        sample_export / "memories" / "snap1.jpg", metadata_dir=sample_export / "metadata"
    )
    assert source == "export_metadata"
    assert ts.year == 2021


def test_checksum_and_dedupe(sample_export: Path) -> None:
    digest = compute_sha256(sample_export / "memories" / "snap1.jpg")
    dedupe = InMemoryDedupeRepository()
    key = f"{digest}:11:2021-08-12T10:11:12"
    assert not dedupe.exists(key)
    dedupe.put(key, "abc")
    assert dedupe.exists(key)
