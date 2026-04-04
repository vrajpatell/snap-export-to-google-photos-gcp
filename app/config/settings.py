from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "snap-export-to-google-photos-gcp"
    env: str = "dev"
    host: str = "0.0.0.0"
    port: int = 8080
    max_upload_size_mb: int = 512
    gcs_bucket: str = "snap-import-staging"
    firestore_collection_jobs: str = "import_jobs"
    firestore_collection_dedupe: str = "dedupe_registry"
    oauth_client_secret_ref: str = Field(default="projects/PROJECT/secrets/google-oauth-client/versions/latest")
    oauth_token_secret_ref: str = Field(default="projects/PROJECT/secrets/google-oauth-token/versions/latest")
    google_oauth_redirect_uri: str = "http://localhost:8080/auth/google/callback"
    google_oauth_scopes: tuple[str, ...] = (
        "https://www.googleapis.com/auth/photoslibrary.appendonly",
        "openid",
        "email",
    )


settings = Settings()
