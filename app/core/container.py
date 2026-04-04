from __future__ import annotations

from pathlib import Path

from app.adapters.db.in_memory import InMemoryDedupeRepository, InMemoryJobRepository, InMemoryManifestRepository
from app.adapters.google_photos.client import GooglePhotosClient
from app.services.import_service import ImportService
from app.services.oauth_service import OAuthService
from app.services.report_service import ReportService

workspace = Path(".localdata")
job_repo = InMemoryJobRepository()
manifest_repo = InMemoryManifestRepository()
dedupe_repo = InMemoryDedupeRepository()
oauth_service = OAuthService()
photos_client = GooglePhotosClient(access_token_provider=oauth_service.access_token)
import_service = ImportService(job_repo, manifest_repo, dedupe_repo, photos_client, workspace=workspace)
report_service = ReportService(output_dir=workspace / "reports")
