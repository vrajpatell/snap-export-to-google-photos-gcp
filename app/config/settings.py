from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "snap-export-to-google-photos-gcp"
    env: str = "dev"
    host: str = "0.0.0.0"
    port: int = 8080
    max_upload_size_mb: int = 512

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


settings = Settings()
