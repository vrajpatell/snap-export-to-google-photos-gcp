#!/usr/bin/env bash
set -euo pipefail
: "${GCP_PROJECT_ID:?set GCP_PROJECT_ID}"
: "${GCP_REGION:=us-central1}"
gcloud auth login
gcloud config set project "$GCP_PROJECT_ID"
gcloud config set run/region "$GCP_REGION"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudtasks.googleapis.com firestore.googleapis.com secretmanager.googleapis.com storage.googleapis.com
