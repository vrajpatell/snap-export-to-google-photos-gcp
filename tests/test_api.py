from __future__ import annotations

import io
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.config.settings import settings
from app.main import app


def test_health_endpoints() -> None:
    client = TestClient(app)
    assert client.get("/healthz").status_code == 200
    assert client.get("/readyz").status_code == 200


def test_create_import_and_report(tmp_path: Path) -> None:
    sample = tmp_path / "sample"
    sample.mkdir()
    (sample / "a.jpg").write_bytes(b"a")
    client = TestClient(app)
    response = client.post("/imports", params={"local_folder_path": str(sample)})
    assert response.status_code == 200
    job_id = response.json()["job_id"]
    start = client.post(f"/imports/{job_id}/start")
    assert start.status_code == 200
    report = client.get(f"/imports/{job_id}/report")
    assert report.status_code == 200


def test_staged_upload_flow_and_progress_contract() -> None:
    client = TestClient(app)
    media_bytes = b"fake-image-content"
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as handle:
        handle.writestr("memories/photo1.jpg", media_bytes)
    payload = archive.getvalue()

    staged = client.post(
        "/staging/upload-url",
        json={
            "filename": "snap-export.zip",
            "content_type": "application/zip",
            "size_bytes": len(payload),
        },
    )
    assert staged.status_code == 200
    upload_url = staged.json()["upload_url"]
    object_path = staged.json()["object_path"]

    uploaded = client.put(upload_url, data=payload, headers={"Content-Type": "application/zip"})
    assert uploaded.status_code == 200

    completed = client.post(
        "/staging/complete",
        json={"object_path": object_path, "size_bytes": len(payload)},
    )
    assert completed.status_code == 200
    staged_path = completed.json()["staged_path"]

    created = client.post("/imports", params={"staged_path": staged_path})
    assert created.status_code == 200
    job_id = created.json()["job_id"]
    started = client.post(f"/imports/{job_id}/start")
    assert started.status_code == 200

    progress = client.get(f"/imports/{job_id}")
    assert progress.status_code == 200
    counters = progress.json()["counters"]
    assert {
        "uploaded_count",
        "failed_count",
        "skipped_duplicates",
        "unsupported_count",
        "bytes_processed",
        "supported_files",
    }.issubset(counters.keys())


def test_staging_upload_requires_session_when_auth_enabled(monkeypatch) -> None:
    client = TestClient(app)
    monkeypatch.setattr(settings, "enforce_user_auth", True)
    unauthorized = client.post(
        "/staging/upload-url",
        json={"filename": "a.zip", "content_type": "application/zip", "size_bytes": 1},
    )
    assert unauthorized.status_code == 401
    monkeypatch.setattr(settings, "enforce_user_auth", False)


def test_staging_upload_rejects_disallowed_content_type() -> None:
    client = TestClient(app)
    response = client.post(
        "/staging/upload-url",
        json={"filename": "not-zip.txt", "content_type": "text/plain", "size_bytes": 5},
    )
    assert response.status_code == 400


def test_disallowed_origin_is_rejected(monkeypatch, tmp_path: Path) -> None:
    sample = tmp_path / "sample"
    sample.mkdir()
    (sample / "a.jpg").write_bytes(b"a")
    monkeypatch.setattr(settings, "frontend_allowed_origins", ("https://allowed.example",))
    client = TestClient(app)
    response = client.post(
        "/imports",
        params={"local_folder_path": str(sample)},
        headers={"Origin": "https://blocked.example"},
    )
    assert response.status_code == 403
