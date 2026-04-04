output "api_url" { value = google_cloud_run_v2_service.api.uri }
output "worker_url" { value = google_cloud_run_v2_service.worker.uri }
output "artifact_registry_repo" { value = google_artifact_registry_repository.repo.name }
output "bucket_name" { value = google_storage_bucket.staging.name }
output "queue_name" { value = google_cloud_tasks_queue.imports.name }
output "runtime_service_account_email" { value = google_service_account.runtime.email }
output "deployer_service_account_email" { value = google_service_account.deployer.email }
