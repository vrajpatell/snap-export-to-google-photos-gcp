from __future__ import annotations

from pathlib import Path

from google.cloud import firestore, tasks_v2

from app.adapters.db.firestore import (
    FirestoreDedupeRepository,
    FirestoreJobRepository,
    FirestoreManifestRepository,
)
from app.adapters.db.in_memory import (
    InMemoryDedupeRepository,
    InMemoryJobRepository,
    InMemoryManifestRepository,
)
from app.adapters.google_photos.client import GooglePhotosClient
from app.config.settings import settings
from app.domain.interfaces import DedupeRepository, JobRepository, ManifestRepository
from app.services.import_service import ImportService
from app.services.oauth_service import OAuthService
from app.services.report_service import ReportService
from app.services.session_service import SessionService
from app.services.staging_service import StagingService
from app.services.task_service import TaskService

workspace = Path(".localdata")

job_repo: JobRepository
manifest_repo: ManifestRepository
dedupe_repo: DedupeRepository
task_service: TaskService | None

if settings.use_gcp_backends:
    fs_client = firestore.Client(
        project=settings.gcp_project_id,
        database=settings.firestore_database,
    )
    job_repo = FirestoreJobRepository(fs_client, settings.firestore_collection_jobs)
    manifest_repo = FirestoreManifestRepository(fs_client, settings.firestore_collection_jobs)
    dedupe_repo = FirestoreDedupeRepository(fs_client, settings.firestore_collection_dedupe)
    task_service = TaskService(
        client=tasks_v2.CloudTasksClient(),
        project_id=settings.gcp_project_id,
        region=settings.gcp_region,
        queue=settings.cloud_tasks_queue,
        worker_url=settings.cloud_tasks_worker_url or f"{settings.app_base_url}/tasks/process",
        worker_audience=settings.cloud_tasks_worker_audience or settings.app_base_url,
        service_account_email=settings.cloud_tasks_service_account_email,
        task_token=settings.cloud_tasks_task_token,
    )
else:
    job_repo = InMemoryJobRepository()
    manifest_repo = InMemoryManifestRepository()
    dedupe_repo = InMemoryDedupeRepository()
    task_service = None

oauth_service = OAuthService()
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
