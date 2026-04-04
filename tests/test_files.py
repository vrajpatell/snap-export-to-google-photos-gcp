from __future__ import annotations

import zipfile
from pathlib import Path

import pytest

from app.utils.files import ZipSlipError, discover_files, safe_extract_zip


def test_safe_extract_zip_rejects_zip_slip(tmp_path: Path) -> None:
    zip_path = tmp_path / "bad.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("../evil.txt", "oops")
    with pytest.raises(ZipSlipError):
        safe_extract_zip(zip_path, tmp_path / "out")


def test_discover_files(sample_export: Path) -> None:
    files = {path.name for path in discover_files(sample_export)}
    assert {"snap1.jpg", "snap2.mp4", "notes.txt", "memories_history.json"}.issubset(files)
