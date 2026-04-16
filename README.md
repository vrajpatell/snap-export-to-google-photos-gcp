# snap-export-to-google-photos-gcp

FastAPI service to import Snapchat export ZIP/folders into Google Photos using official OAuth + Photos Library API.

This repo now includes a lightweight React frontend (`frontend/`) for:
- app access sign-in (Google Identity, optional but recommended)
- direct browser upload to GCS staging via signed URL
- Google Photos OAuth connect flow
- import start + live progress polling + report links

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

Dependency lock maintenance:
```bash
python -m pip install pip-tools
pip-compile pyproject.toml -o requirements.lock
```

Frontend:
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Deployment docs
- `docs/deployment-gcp.md`
- `docs/api-frontend.md`
- `docs/oauth-google-photos.md`
- `docs/operations.md`
- `docs/observability-gcp.md`

## Curl examples
```bash
curl "$APP_URL/healthz"
curl "$APP_URL/readyz"
curl -X POST "$APP_URL/imports?local_folder_path=/tmp/snap-export"
curl -X POST "$APP_URL/imports/<job_id>/start"
```

## Browser upload API flow
1. `POST /staging/upload-url` with `filename`, `content_type`, `size_bytes`
2. Browser `PUT` to returned signed URL (GCS in production)
3. `POST /staging/complete` with `object_path` + `size_bytes`
4. `POST /imports?staged_path=<returned_staged_path>`
5. `POST /imports/{job_id}/start`, then poll `GET /imports/{job_id}`
