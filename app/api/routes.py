from __future__ import annotations

import shutil
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from app.config.settings import settings
from app.core.container import (
    import_service,
    job_repo,
    manifest_repo,
    oauth_service,
    report_service,
    session_service,
    staging_service,
    task_service,
)
from app.models.job import ImportJobCreate, JobActionResponse

router = APIRouter()


class ProcessTaskRequest(BaseModel):
    job_id: str


class SessionLoginRequest(BaseModel):
    id_token: str = Field(min_length=20)


class SessionLoginResponse(BaseModel):
    session_token: str
    email: str
    expires_at: str


class AuthGoogleStartRequest(BaseModel):
    flow: str = "api"


class StagingUploadUrlRequest(BaseModel):
    filename: str
    content_type: str
    size_bytes: int = Field(gt=0)


class StagingUploadUrlResponse(BaseModel):
    upload_url: str
    object_path: str
    method: str
    required_headers: dict[str, str]
    expires_at: str


class StagingCompleteRequest(BaseModel):
    object_path: str
    size_bytes: int = Field(gt=0)


class StagingCompleteResponse(BaseModel):
    staged_path: str


def _current_user_email(authorization: str | None) -> str | None:
    if not settings.enforce_user_auth:
        return None
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing session token")
    session_token = authorization.split(" ", 1)[1].strip()
    try:
        return session_service.verify_session_token(session_token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.post("/auth/session/google", response_model=SessionLoginResponse)
def auth_session_google(payload: SessionLoginRequest) -> SessionLoginResponse:
    try:
        session_service.enforce_auth_enabled()
        email = session_service.verify_google_identity_token(payload.id_token)
        session = session_service.create_session_token(email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return SessionLoginResponse(
        session_token=session.token,
        email=session.email,
        expires_at=datetime.fromtimestamp(session.expires_at_epoch, tz=UTC).isoformat(),
    )


@router.post("/auth/google/start")
def auth_google_start(
    payload: AuthGoogleStartRequest | None = None,
    authorization: str | None = Header(default=None),
) -> dict[str, str]:
    user = _current_user_email(authorization)
    payload = payload or AuthGoogleStartRequest()
    flow = payload.flow if payload.flow in {"api", "web"} else "api"
    try:
        start = oauth_service.start(requested_by=user, flow=flow)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"authorization_url": start.authorization_url, "state": start.state}


@router.get("/auth/google/callback", response_model=None)
def auth_google_callback(code: str, state: str) -> dict[str, str] | HTMLResponse:
    try:
        flow = oauth_service.callback_flow(state)
        token_ref = oauth_service.exchange_code(code=code, state=state)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if flow == "web":
        frontend_origin = settings.frontend_base_url
        post_message_line = (
            'window.opener.postMessage({ type: "oauth_complete", ok: true },'
            f' "{frontend_origin}");'
        )
        html = f"""
        <!doctype html>
        <html>
          <body>
            <script>
              if (window.opener) {{
                {post_message_line}
                window.close();
              }}
            </script>
            OAuth completed. You can close this window.
          </body>
        </html>
        """
        return HTMLResponse(content=html)
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
    authorization: str | None = Header(default=None),
) -> dict[str, str]:
    _current_user_email(authorization)
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
def list_imports(authorization: str | None = Header(default=None)) -> list[dict[str, str]]:
    _current_user_email(authorization)
    return [
        {"job_id": j.job_id, "status": j.status.value, "source_uri": j.source_uri}
        for j in job_repo.list()
    ]


@router.get("/imports/{job_id}")
def get_import(job_id: str, authorization: str | None = Header(default=None)) -> dict[str, object]:
    _current_user_email(authorization)
    job = job_repo.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job.model_dump(mode="json")


@router.post("/tasks/process")
def process_import_task(
    payload: ProcessTaskRequest, x_task_token: str | None = Header(default=None)
) -> dict[str, str]:
    if settings.use_gcp_backends and x_task_token != settings.cloud_tasks_task_token:
        raise HTTPException(status_code=401, detail="invalid task token")
    job = import_service.start_upload(payload.job_id)
    return {"job_id": job.job_id, "status": job.status.value}


@router.post("/imports/{job_id}/pause", response_model=JobActionResponse)
def pause_import(
    job_id: str, authorization: str | None = Header(default=None)
) -> JobActionResponse:
    _current_user_email(authorization)
    job = import_service.pause(job_id)
    return JobActionResponse(job_id=job.job_id, status=job.status, message="pause requested")


@router.post("/imports/{job_id}/resume", response_model=JobActionResponse)
def resume_import(
    job_id: str, authorization: str | None = Header(default=None)
) -> JobActionResponse:
    _current_user_email(authorization)
    if task_service:
        task_service.enqueue_process_job(job_id)
        job = import_service.mark_uploading(job_id)
        return JobActionResponse(job_id=job.job_id, status=job.status, message="resume enqueued")
    job = import_service.resume(job_id)
    return JobActionResponse(job_id=job.job_id, status=job.status, message="resume requested")


@router.post("/imports/{job_id}/cancel", response_model=JobActionResponse)
def cancel_import(
    job_id: str, authorization: str | None = Header(default=None)
) -> JobActionResponse:
    _current_user_email(authorization)
    job = import_service.cancel(job_id)
    return JobActionResponse(job_id=job.job_id, status=job.status, message="cancel requested")


@router.get("/imports/{job_id}/report")
def get_report(
    job_id: str, fmt: str = "json", authorization: str | None = Header(default=None)
) -> FileResponse:
    _current_user_email(authorization)
    job = job_repo.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    records = manifest_repo.load_records(job_id)
    paths = report_service.build(job, records)
    report_path = paths.json_path if fmt == "json" else paths.csv_path
    media_type = "application/json" if fmt == "json" else "text/csv"
    return FileResponse(path=report_path, media_type=media_type)


@router.post("/imports/{job_id}/start", response_model=JobActionResponse)
def start_import(
    job_id: str, authorization: str | None = Header(default=None)
) -> JobActionResponse:
    _current_user_email(authorization)
    if task_service:
        task_service.enqueue_process_job(job_id)
        job = import_service.mark_uploading(job_id)
        return JobActionResponse(job_id=job.job_id, status=job.status, message="task enqueued")
    job = import_service.start_upload(job_id)
    return JobActionResponse(job_id=job.job_id, status=job.status, message="start invoked")


@router.post("/staging/upload-url", response_model=StagingUploadUrlResponse)
def staging_upload_url(
    payload: StagingUploadUrlRequest, authorization: str | None = Header(default=None)
) -> StagingUploadUrlResponse:
    _current_user_email(authorization)
    try:
        upload = staging_service.create_upload_url(
            filename=payload.filename,
            content_type=payload.content_type,
            size_bytes=payload.size_bytes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StagingUploadUrlResponse(
        upload_url=upload.upload_url,
        object_path=upload.object_path,
        method=upload.method,
        required_headers=upload.required_headers,
        expires_at=upload.expires_at.isoformat(),
    )


@router.post("/staging/complete", response_model=StagingCompleteResponse)
def staging_complete(
    payload: StagingCompleteRequest, authorization: str | None = Header(default=None)
) -> StagingCompleteResponse:
    _current_user_email(authorization)
    try:
        staged_path = staging_service.complete(
            object_path=payload.object_path, expected_size_bytes=payload.size_bytes
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StagingCompleteResponse(staged_path=staged_path)


@router.put("/staging/local-upload/{object_path:path}")
async def staging_local_upload(
    object_path: str,
    request: Request,
    content_type: str = Header(default="application/octet-stream", alias="Content-Type"),
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    _current_user_email(authorization)
    body = await request.body()
    try:
        size = staging_service.write_local_upload_chunk(
            object_path=object_path,
            body=body,
            content_type=content_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"object_path": object_path, "size_bytes": size}


@router.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
def readyz() -> dict[str, str]:
    return {"status": "ready"}
