# snap-export-to-google-photos-gcp

FastAPI service to import Snapchat export ZIP/folders into Google Photos using official OAuth + Photos Library API.

## Architecture (simple production)
- Cloud Run API service
- Cloud Run worker service (task target)
- Cloud Tasks queue for async processing
- Artifact Registry for images
- Cloud Storage staging bucket
- Firestore (Native mode) for jobs/manifests/dedupe
- Secret Manager for OAuth values + refresh token + task token

## Quick audit summary
Already present: FastAPI API routes, health endpoints, importer logic, Dockerfile, tests, baseline Terraform.
Missing before this change: Cloud Tasks orchestration, Firestore-backed state, real OAuth token exchange/storage, CI/CD workflows, robust GCP Terraform resources, deployment/ops docs, helper scripts.

## Local run
```bash
make setup
cp .env.example .env
make run
```

## Deployment docs
- `docs/deployment-gcp.md`
- `docs/oauth-google-photos.md`
- `docs/operations.md`

## Curl examples
```bash
curl "$APP_URL/healthz"
curl "$APP_URL/readyz"
curl -X POST "$APP_URL/imports?local_folder_path=/tmp/snap-export"
curl -X POST "$APP_URL/imports/<job_id>/start"
```
