from __future__ import annotations

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
    photos_oauth_scopes: str = (
        "https://www.googleapis.com/auth/photoslibrary.appendonly,openid,email"
    )

    oauth_token_secret_id: str = "google-oauth-refresh-token"
    use_gcp_backends: bool = False
    frontend_base_url: str = "http://localhost:5173"
    frontend_allowed_origins: str = "http://localhost:5173"
    enforce_user_auth: bool = False
    allowed_user_emails: str = ""
    app_session_secret: str = ""
    app_session_ttl_seconds: int = 43200
    staging_signed_url_ttl_seconds: int = 900
    staging_allowed_content_types: str = (
        "application/zip,application/x-zip-compressed,application/octet-stream"
    )

    @staticmethod
    def _split_csv(value: str) -> tuple[str, ...]:
        stripped = (value or "").strip()
        if not stripped:
            return ()
        return tuple(part.strip() for part in stripped.split(",") if part.strip())

    @property
    def photos_oauth_scopes_list(self) -> tuple[str, ...]:
        return self._split_csv(self.photos_oauth_scopes)

    @property
    def frontend_allowed_origins_list(self) -> tuple[str, ...]:
        return self._split_csv(self.frontend_allowed_origins)

    @property
    def allowed_user_emails_list(self) -> tuple[str, ...]:
        return self._split_csv(self.allowed_user_emails)

    @property
    def staging_allowed_content_types_list(self) -> tuple[str, ...]:
        return self._split_csv(self.staging_allowed_content_types)


settings = Settings()
