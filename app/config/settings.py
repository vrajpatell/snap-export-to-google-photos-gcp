from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "snap-export-to-google-photos"
    env: str = "dev"
    host: str = "0.0.0.0"
    port: int = 8080
    max_upload_size_mb: int = 512
    max_staged_upload_size_mb: int = 20480

    app_base_url: str = "http://localhost:8080"
    frontend_base_url: str = "http://localhost:5173"
    frontend_allowed_origins: str = "http://localhost:5173"

    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""
    google_oauth_redirect_uri: str = "http://localhost:8080/auth/google/callback"
    photos_oauth_scopes: str = (
        "https://www.googleapis.com/auth/photoslibrary.appendonly,openid,email"
    )

    app_session_secret: str = ""
    app_session_ttl_seconds: int = 43200
    enforce_user_auth: bool = False
    allowed_user_emails: str = ""

    database_url: str = ""
    persistence_backend: str = "memory"  # memory or postgres
    oauth_token_name: str = "google-oauth-refresh-token"
    oauth_token_encryption_key: str = ""

    storage_backend: str = "local"  # local or s3
    s3_staging_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_endpoint_url: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_public_base_url: str = ""
    blob_read_write_token: str = ""

    queue_backend: str = "inline"  # inline or qstash
    qstash_token: str = ""
    qstash_current_signing_key: str = ""
    qstash_next_signing_key: str = ""
    qstash_worker_url: str = ""
    task_token: str = "dev-task-token"

    vercel: bool = False
    vercel_url: str = ""
    vercel_environment: str = ""
    serverless_max_files_per_invocation: int = 25

    staging_signed_url_ttl_seconds: int = 900
    staging_allowed_content_types: str = (
        "application/zip,application/x-zip-compressed,application/octet-stream"
    )

    @staticmethod
    def _split_csv(value: str | tuple[str, ...]) -> tuple[str, ...]:
        if isinstance(value, tuple):
            return value
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

    @property
    def is_production(self) -> bool:
        return self.env.lower() in {"prod", "production"} or self.vercel_environment == "production"


settings = Settings()
