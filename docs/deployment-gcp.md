# GCP Deployment

## Required APIs
run, artifactregistry, cloudbuild, cloudtasks, firestore, storage, secretmanager, iamcredentials, monitoring, logging.

## Terraform deploy
```bash
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
# values are pre-filled for encoded-source-492312-b0
scripts/tf.sh plan
scripts/tf.sh apply
```

`terraform.tfvars` now also requires:
- `frontend_image`
- `frontend_service_name`
- `allowed_user_emails` (recommended for app access control)

## Seed required secrets before first deploy
```bash
export GCP_PROJECT_ID=encoded-source-492312-b0
export GOOGLE_OAUTH_CLIENT_ID="<your-client-id>.apps.googleusercontent.com"
export GOOGLE_OAUTH_CLIENT_SECRET="<your-client-secret>"
export APP_SESSION_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(64))')"
# optional: set your own token instead of auto-generated one
# export CLOUD_TASKS_TASK_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"

scripts/set_gcp_secrets.sh
```

PowerShell equivalent:
```powershell
$env:GCP_PROJECT_ID="encoded-source-492312-b0"
$env:GOOGLE_OAUTH_CLIENT_ID="<your-client-id>.apps.googleusercontent.com"
$env:GOOGLE_OAUTH_CLIENT_SECRET="<your-client-secret>"
$env:APP_SESSION_SECRET="<long-random-secret>"
.\scripts\set-gcp-secrets.ps1
```

## Manual gcloud fallback
```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudtasks.googleapis.com firestore.googleapis.com secretmanager.googleapis.com storage.googleapis.com

gcloud artifacts repositories create snap-import --repository-format=docker --location=us-central1

gcloud storage buckets create gs://$GCS_STAGING_BUCKET --location=us-central1

gcloud tasks queues create snap-import-queue --location=us-central1

docker build -t us-central1-docker.pkg.dev/$GCP_PROJECT_ID/snap-import/app:latest .
docker push us-central1-docker.pkg.dev/$GCP_PROJECT_ID/snap-import/app:latest

gcloud run deploy snap-import-api --image us-central1-docker.pkg.dev/$GCP_PROJECT_ID/snap-import/app:latest --region us-central1 --allow-unauthenticated
```

## GitHub Actions CI/CD on GCP

Workflow: `.github/workflows/deploy-cloud-run.yml`

Set these repository secrets:
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOYER_SERVICE_ACCOUNT`
- `GCP_PROJECT_ID`
- `GCP_REGION` (for example `us-central1`)
- `ARTIFACT_REPO` (for example `snap-import`)
- `CLOUD_RUN_RUNTIME_SA` (for example `snap-import-runtime@encoded-source-492312-b0.iam.gserviceaccount.com`)
- `GCS_STAGING_BUCKET` (for example `encoded-source-492312-b0-snap-staging`)

Pipeline behavior on push to `main`:
1. Build container with Cloud Build.
2. Deploy worker Cloud Run service.
3. Deploy API Cloud Run service with Cloud Tasks and GCS env vars.
4. Update API base/redirect URLs to the actual Cloud Run URL.

## Redirect and frontend URL wiring
- OAuth redirect URI in Google Cloud Console must match API callback URL:
  - `https://<api-service-url>/auth/google/callback`
- API runtime env should expose:
  - `FRONTEND_BASE_URL=https://<frontend-service-url>`
  - `FRONTEND_ALLOWED_ORIGINS=https://<frontend-service-url>`

## Frontend image and deploy
Build frontend image with compile-time API URL and Google client id:
```bash
docker build \
  -f frontend/Dockerfile \
  --build-arg VITE_API_BASE_URL="https://<api-url>" \
  --build-arg VITE_GOOGLE_CLIENT_ID="<client-id>.apps.googleusercontent.com" \
  -t us-central1-docker.pkg.dev/$GCP_PROJECT_ID/snap-import/frontend:latest \
  frontend

docker push us-central1-docker.pkg.dev/$GCP_PROJECT_ID/snap-import/frontend:latest
```

Set `frontend_image` in `infra/terraform/terraform.tfvars`, then apply Terraform.
