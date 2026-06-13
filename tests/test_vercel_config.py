from __future__ import annotations

from cryptography.fernet import Fernet

from app.adapters.db.in_memory import InMemoryOAuthTokenRepository
from app.config.settings import Settings, settings
from app.services.oauth_service import OAuthService
from app.services.staging_service import StagingService


def test_vercel_settings_parse_csv_origins() -> None:
    parsed = Settings(frontend_allowed_origins="https://a.example, https://b.example")
    assert parsed.frontend_allowed_origins_list == ("https://a.example", "https://b.example")


def test_local_staging_upload_url_and_complete(tmp_path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(settings, "storage_backend", "local")
    staging = StagingService(tmp_path)
    payload = b"zip-bytes"
    upload = staging.create_upload_url("export.zip", "application/zip", len(payload))
    assert upload.method == "PUT"
    assert upload.object_path.startswith("uploads/")
    staging.write_local_upload_chunk(upload.object_path, payload, "application/zip")
    assert staging.complete(upload.object_path, len(payload)) == f"local://{upload.object_path}"


def test_oauth_refresh_token_is_encrypted(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    repo = InMemoryOAuthTokenRepository()
    key = Fernet.generate_key().decode("utf-8")
    monkeypatch.setattr(settings, "oauth_token_encryption_key", key)
    monkeypatch.setattr(settings, "oauth_token_name", "test-token")
    service = OAuthService(token_repo=repo)
    service._store_refresh_token("refresh-secret")
    stored = repo.load_refresh_token("test-token")
    assert stored and stored != "refresh-secret"
    assert service._load_refresh_token() == "refresh-secret"
