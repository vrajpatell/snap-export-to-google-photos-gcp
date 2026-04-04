from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config.settings import settings
from app.core.container import (
    import_service,
    job_repo,
    manifest_repo,
    oauth_service,
    report_service,
    task_service,
)
from app.models.job import ImportJobCreate, JobActionResponse

router = APIRouter()


class ProcessTaskRequest(BaseModel):
    job_id: str


@router.post("/auth/google/start")
def auth_google_start() -> dict[str, str]:
    start = oauth_service.start()
    return {"authorization_url": start.authorization_url, "state": start.state}


@router.get("/auth/google/callback")
def auth_google_callback(code: str, state: str) -> dict[str, str]:
    try:
        token_ref = oauth_service.exchange_code(code=code, state=state)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"message": "oauth completed", "token_reference": token_ref}


@router.post("/imports")
async def create_import(
    dry_run: bool = False,
    skip_existing: bool = True,
    force_reupload: bool = False,
    album_strategy: str = "year_month",
    local_folder_path: str | None = None,
    staged_path: str | None = None,
    upload: UploadFile | None = None,
) -> dict[str, str]:
    upload_path: Path | None = None
    if upload:
        if not upload.filename:
            raise HTTPException(status_code=400, detail="missing upload filename")
        upload_path = Path(".localdata/uploads") / Path(upload.filename).name
        upload_path.parent.mkdir(parents=True, exist_ok=True)
        with upload_path.open("wb") as handle:
            shutil.copyfileobj(upload.file, handle)

    request = ImportJobCreate(
        dry_run=dry_run,
        skip_existing=skip_existing,
        force_reupload=force_reupload,
        album_strategy=album_strategy,  # type: ignore[arg-type]
        local_folder_path=local_folder_path,
        staged_path=staged_path,
    )
    try:
        job = import_service.create_job(request, uploaded_zip=upload_path)
        import_service.scan(job.job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"job_id": job.job_id, "status": job.status.value}


@router.get("/imports")
def list_imports() -> list[dict[str, str]]:
    return [
        {"job_id": j.job_id, "status": j.status.value, "source_uri": j.source_uri}
        for j in job_repo.list()
    ]


@router.get("/imports/{job_id}")
def get_import(job_id: str) -> dict[str, object]:
    job = job_repo.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job.model_dump(mode="json")


@router.post("/imports/{job_id}/start", response_model=JobActionResponse)
def start_import(job_id: str) -> JobActionResponse:
    if task_service:
        task_service.enqueue_process_job(job_id)
        job = import_service.mark_uploading(job_id)
        return JobActionResponse(job_id=job.job_id, status=job.status, message="task enqueued")
    job = import_service.start_upload(job_id)
    return JobActionResponse(job_id=job.job_id, status=job.status, message="start invoked")


@router.post("/tasks/process")
def process_import_task(
    payload: ProcessTaskRequest, x_task_token: str | None = Header(default=None)
) -> dict[str, str]:
    if settings.use_gcp_backends and x_task_token != settings.cloud_tasks_task_token:
        raise HTTPException(status_code=401, detail="invalid task token")
    job = import_service.start_upload(payload.job_id)
    return {"job_id": job.job_id, "status": job.status.value}


@router.post("/imports/{job_id}/pause", response_model=JobActionResponse)
def pause_import(job_id: str) -> JobActionResponse:
    job = import_service.pause(job_id)
    return JobActionResponse(job_id=job.job_id, status=job.status, message="pause requested")


@router.post("/imports/{job_id}/resume", response_model=JobActionResponse)
def resume_import(job_id: str) -> JobActionResponse:
    if task_service:
        task_service.enqueue_process_job(job_id)
        job = import_service.mark_uploading(job_id)
        return JobActionResponse(job_id=job.job_id, status=job.status, message="resume enqueued")
    job = import_service.resume(job_id)
    return JobActionResponse(job_id=job.job_id, status=job.status, message="resume requested")


@router.post("/imports/{job_id}/cancel", response_model=JobActionResponse)
def cancel_import(job_id: str) -> JobActionResponse:
    job = import_service.cancel(job_id)
    return JobActionResponse(job_id=job.job_id, status=job.status, message="cancel requested")


@router.get("/imports/{job_id}/report")
def get_report(job_id: str, fmt: str = "json") -> FileResponse:
    job = job_repo.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    records = manifest_repo.load_records(job_id)
    paths = report_service.build(job, records)
    report_path = paths.json_path if fmt == "json" else paths.csv_path
    media_type = "application/json" if fmt == "json" else "text/csv"
    return FileResponse(path=report_path, media_type=media_type)


@router.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
def readyz() -> dict[str, str]:
    return {"status": "ready"}
