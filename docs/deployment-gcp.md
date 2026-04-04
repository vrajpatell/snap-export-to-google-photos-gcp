# GCP Deployment

## Required APIs
run, artifactregistry, cloudbuild, cloudtasks, firestore, storage, secretmanager, iamcredentials.

## Terraform deploy
```bash
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
# edit values
scripts/tf.sh plan
scripts/tf.sh apply
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
