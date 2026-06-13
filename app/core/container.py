from __future__ import annotations

from pathlib import Path

from app.adapters.db.in_memory import (
    InMemoryDedupeRepository,
    InMemoryJobRepository,
    InMemoryManifestRepository,
    InMemoryOAuthTokenRepository,
)
from app.adapters.google_photos.client import GooglePhotosClient
from app.config.settings import settings
from app.domain.interfaces import (
    DedupeRepository,
    JobRepository,
    ManifestRepository,
    OAuthTokenRepository,
)
from app.services.import_service import ImportService
from app.services.oauth_service import OAuthService
from app.services.report_service import ReportService
from app.services.session_service import SessionService
from app.services.staging_service import StagingService
from app.services.task_service import TaskService

workspace = Path("/tmp/snap-import" if settings.vercel else ".localdata")

job_repo: JobRepository
manifest_repo: ManifestRepository
dedupe_repo: DedupeRepository
oauth_token_repo: OAuthTokenRepository
task_service: TaskService | None = TaskService() if settings.queue_backend == "qstash" else None

if settings.persistence_backend == "postgres":
    from app.adapters.db.postgres import PostgresStore

    store = PostgresStore(settings.database_url)
    job_repo = store
    manifest_repo = store
    dedupe_repo = store
    oauth_token_repo = store
elif settings.is_production:
    raise RuntimeError("PERSISTENCE_BACKEND=postgres and DATABASE_URL are required in production")
else:
    job_repo = InMemoryJobRepository()
    manifest_repo = InMemoryManifestRepository()
    dedupe_repo = InMemoryDedupeRepository()
    oauth_token_repo = InMemoryOAuthTokenRepository()

oauth_service = OAuthService(token_repo=oauth_token_repo)
session_service = SessionService()
photos_client = GooglePhotosClient(access_token_provider=oauth_service.access_token)
staging_service = StagingService(workspace=workspace)
import_service = ImportService(
    job_repo,
    manifest_repo,
    dedupe_repo,
    photos_client,
    workspace=workspace,
    staging=staging_service,
)
report_service = ReportService(output_dir=workspace / "reports")
