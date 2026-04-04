from __future__ import annotations

import csv
import hashlib
import json
import zipfile
from collections.abc import Iterable
from pathlib import Path


class ZipSlipError(ValueError):
    """Raised when a ZIP entry attempts directory traversal."""


def compute_sha256(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def safe_extract_zip(source_zip: Path, destination_dir: Path) -> list[Path]:
    destination_dir.mkdir(parents=True, exist_ok=True)
    extracted: list[Path] = []
    with zipfile.ZipFile(source_zip) as archive:
        for member in archive.infolist():
            target_path = (destination_dir / member.filename).resolve()
            if (
                destination_dir.resolve() not in target_path.parents
                and target_path != destination_dir.resolve()
            ):
                raise ZipSlipError(f"Unsafe ZIP entry detected: {member.filename}")
            archive.extract(member, destination_dir)
            if not member.is_dir():
                extracted.append(target_path)
    return extracted


def discover_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if path.is_file():
            yield path


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
