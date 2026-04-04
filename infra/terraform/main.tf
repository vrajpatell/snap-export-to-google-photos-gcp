terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = { source = "hashicorp/google", version = ">= 5.30.0" }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  required_services = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "cloudtasks.googleapis.com",
    "iamcredentials.googleapis.com"
  ]
}

resource "google_project_service" "services" {
  for_each = toset(local.required_services)
  service  = each.key
}

resource "google_artifact_registry_repository" "repo" {
  location      = var.region
  repository_id = var.artifact_registry_repo
  format        = "DOCKER"
  depends_on    = [google_project_service.services]
}

resource "google_storage_bucket" "staging" {
  name                        = var.bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
}

resource "google_firestore_database" "default" {
  name        = var.firestore_database_id
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"
}

resource "google_cloud_tasks_queue" "imports" {
  name     = var.queue_name
  location = var.region
  retry_config { max_attempts = 5 }
}

resource "google_secret_manager_secret" "oauth_client_id" { secret_id = "google-oauth-client-id" replication { auto {} } }
resource "google_secret_manager_secret" "oauth_client_secret" { secret_id = "google-oauth-client-secret" replication { auto {} } }
resource "google_secret_manager_secret" "oauth_refresh_token" { secret_id = "google-oauth-refresh-token" replication { auto {} } }
resource "google_secret_manager_secret" "task_token" { secret_id = "cloud-tasks-shared-token" replication { auto {} } }

resource "google_service_account" "runtime" {
  account_id   = "snap-import-runtime"
  display_name = "Snap Import Runtime SA"
}

resource "google_service_account" "deployer" {
  account_id   = "snap-import-deployer"
  display_name = "Snap Import GitHub Deployer SA"
}

resource "google_project_iam_member" "runtime_firestore" { project = var.project_id role = "roles/datastore.user" member = "serviceAccount:${google_service_account.runtime.email}" }
resource "google_project_iam_member" "runtime_storage" { project = var.project_id role = "roles/storage.objectAdmin" member = "serviceAccount:${google_service_account.runtime.email}" }
resource "google_project_iam_member" "runtime_tasks" { project = var.project_id role = "roles/cloudtasks.enqueuer" member = "serviceAccount:${google_service_account.runtime.email}" }
resource "google_project_iam_member" "runtime_secret" { project = var.project_id role = "roles/secretmanager.secretAccessor" member = "serviceAccount:${google_service_account.runtime.email}" }

resource "google_project_iam_member" "deployer_run_admin" { project = var.project_id role = "roles/run.admin" member = "serviceAccount:${google_service_account.deployer.email}" }
resource "google_project_iam_member" "deployer_artifact" { project = var.project_id role = "roles/artifactregistry.writer" member = "serviceAccount:${google_service_account.deployer.email}" }
resource "google_project_iam_member" "deployer_sa_user" { project = var.project_id role = "roles/iam.serviceAccountUser" member = "serviceAccount:${google_service_account.deployer.email}" }

resource "google_cloud_run_v2_service" "api" {
  name     = var.api_service_name
  location = var.region
  template {
    service_account = google_service_account.runtime.email
    containers {
      image = var.container_image
      env { name = "USE_GCP_BACKENDS" value = "true" }
      env { name = "GCP_PROJECT_ID" value = var.project_id }
      env { name = "GCP_REGION" value = var.region }
      env { name = "APP_BASE_URL" value = "https://${var.api_service_name}-${data.google_project.current.number}.${var.region}.run.app" }
      env { name = "CLOUD_TASKS_QUEUE" value = google_cloud_tasks_queue.imports.name }
      env { name = "CLOUD_TASKS_WORKER_URL" value = "https://${var.worker_service_name}-${data.google_project.current.number}.${var.region}.run.app/tasks/process" }
      env { name = "CLOUD_TASKS_WORKER_AUDIENCE" value = "https://${var.worker_service_name}-${data.google_project.current.number}.${var.region}.run.app" }
      env { name = "CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL" value = google_service_account.runtime.email }
      env { name = "FIRESTORE_DATABASE" value = var.firestore_database_id }
      env { name = "GCS_STAGING_BUCKET" value = var.bucket_name }
      env { name = "GOOGLE_OAUTH_REDIRECT_URI" value = "https://${var.api_service_name}-${data.google_project.current.number}.${var.region}.run.app/auth/google/callback" }
      env { name = "GOOGLE_OAUTH_CLIENT_ID" value_source { secret_key_ref { secret = google_secret_manager_secret.oauth_client_id.secret_id version = "latest" } } }
      env { name = "GOOGLE_OAUTH_CLIENT_SECRET" value_source { secret_key_ref { secret = google_secret_manager_secret.oauth_client_secret.secret_id version = "latest" } } }
      env { name = "CLOUD_TASKS_TASK_TOKEN" value_source { secret_key_ref { secret = google_secret_manager_secret.task_token.secret_id version = "latest" } } }
    }
  }
  ingress = "INGRESS_TRAFFIC_ALL"
}

resource "google_cloud_run_v2_service" "worker" {
  name     = var.worker_service_name
  location = var.region
  template {
    service_account = google_service_account.runtime.email
    containers {
      image = var.container_image
      env { name = "USE_GCP_BACKENDS" value = "true" }
      env { name = "GCP_PROJECT_ID" value = var.project_id }
      env { name = "GCP_REGION" value = var.region }
      env { name = "CLOUD_TASKS_TASK_TOKEN" value_source { secret_key_ref { secret = google_secret_manager_secret.task_token.secret_id version = "latest" } } }
      env { name = "GOOGLE_OAUTH_CLIENT_ID" value_source { secret_key_ref { secret = google_secret_manager_secret.oauth_client_id.secret_id version = "latest" } } }
      env { name = "GOOGLE_OAUTH_CLIENT_SECRET" value_source { secret_key_ref { secret = google_secret_manager_secret.oauth_client_secret.secret_id version = "latest" } } }
    }
  }
  ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"
}

resource "google_cloud_run_v2_service_iam_member" "worker_invoker" {
  name     = google_cloud_run_v2_service.worker.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.runtime.email}"
}

data "google_project" "current" {
  project_id = var.project_id
}
