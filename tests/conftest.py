from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture
def sample_export(tmp_path: Path) -> Path:
    root = tmp_path / "sample_export"
    media = root / "memories"
    metadata = root / "metadata"
    media.mkdir(parents=True)
    metadata.mkdir(parents=True)
    (media / "snap1.jpg").write_bytes(b"image-bytes")
    (media / "snap2.mp4").write_bytes(b"video-bytes")
    (media / "notes.txt").write_text("unsupported", encoding="utf-8")
    (metadata / "memories_history.json").write_text(
        '[{"filename":"snap1.jpg","capture_time":"2021-08-12T10:11:12Z"}]',
        encoding="utf-8",
    )
    return root
