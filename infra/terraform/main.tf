terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.30.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "pubsub.googleapis.com"
  ])
  service = each.key
}

resource "google_storage_bucket" "staging" {
  name                        = "${var.project_id}-snap-import-staging"
  location                    = var.region
  uniform_bucket_level_access = true
}

resource "google_firestore_database" "default" {
  name        = "(default)"
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"
}

resource "google_secret_manager_secret" "oauth_client" {
  secret_id = "google-oauth-client"
  replication { auto {} }
}

resource "google_secret_manager_secret" "oauth_token" {
  secret_id = "google-oauth-refresh-token"
  replication { auto {} }
}

resource "google_pubsub_topic" "imports" {
  name = "snap-import-jobs"
}
