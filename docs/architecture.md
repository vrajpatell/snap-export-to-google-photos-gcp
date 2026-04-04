# Architecture

## Runtime components

- **API (FastAPI on Cloud Run):** handles auth flow, job creation, control endpoints.
- **Worker (Cloud Run Job or Service):** performs scanning/uploading with retries.
- **Storage (GCS):** stages ZIP uploads and extracted files.
- **Database (Firestore):** job state, manifest pointers, dedupe registry.
- **Secrets (Secret Manager):** OAuth client secret and refresh token references.
- **Queue (Pub/Sub/Cloud Tasks):** asynchronous handoff from API to worker.

## Resumability strategy

- Per-file status saved in manifest repository.
- Dedupe key persisted across restarts.
- `/pause` sets a cooperative stop flag (job status).
- `/resume` continues from last known status, skipping uploaded files.

## Rollback-safe deployment

- Keep prior Cloud Run revision receiving 0–100% traffic split.
- Deploy new revision with no-traffic smoke test.
- Shift traffic gradually (10% → 50% → 100%).
- Roll back by moving traffic to prior revision instantly.
