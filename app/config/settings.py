from __future__ import annotations

import json

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "snap-export-to-google-photos-gcp"
    env: str = "dev"
    host: str = "0.0.0.0"
    port: int = 8080
    max_upload_size_mb: int = 512
    max_staged_upload_size_mb: int = 20480

    gcp_project_id: str = ""
    gcp_region: str = "us-central1"
    app_base_url: str = "http://localhost:8080"

    gcs_staging_bucket: str = ""
    firestore_database: str = "(default)"
    firestore_collection_jobs: str = "import_jobs"
    firestore_collection_dedupe: str = "dedupe_registry"

    cloud_tasks_queue: str = "snap-import-queue"
    cloud_tasks_worker_url: str = ""
    cloud_tasks_worker_audience: str = ""
    cloud_tasks_service_account_email: str = ""
    cloud_tasks_task_token: str = "dev-task-token"

    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    google_oauth_redirect_uri: str = "http://localhost:8080/auth/google/callback"
    photos_oauth_scopes: tuple[str, ...] = (
        "https://www.googleapis.com/auth/photoslibrary.appendonly",
        "openid",
        "email",
    )

    oauth_token_secret_id: str = "google-oauth-refresh-token"
    use_gcp_backends: bool = False
    frontend_base_url: str = "http://localhost:5173"
    frontend_allowed_origins: tuple[str, ...] = ("http://localhost:5173",)
    enforce_user_auth: bool = False
    allowed_user_emails: tuple[str, ...] = ()
    app_session_secret: str = ""
    app_session_ttl_seconds: int = 43200
    staging_signed_url_ttl_seconds: int = 900
    staging_allowed_content_types: tuple[str, ...] = (
        "application/zip",
        "application/x-zip-compressed",
        "application/octet-stream",
    )

    @field_validator(
        "photos_oauth_scopes",
        "frontend_allowed_origins",
        "allowed_user_emails",
        "staging_allowed_content_types",
        mode="before",
    )
    @classmethod
    def parse_sequence_env(cls, value: object) -> object:
        if value is None or isinstance(value, tuple | list):
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return ()
            if stripped.startswith("["):
                parsed = json.loads(stripped)
                if isinstance(parsed, list):
                    return tuple(str(item).strip() for item in parsed if str(item).strip())
            return tuple(part.strip() for part in stripped.split(",") if part.strip())
        return value


settings = Settings()
