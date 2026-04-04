from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

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
