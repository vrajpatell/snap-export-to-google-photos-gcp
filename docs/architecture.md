# Architecture

## Runtime components

- **API (FastAPI on Vercel Functions):** handles auth flow, job creation, control endpoints.
- **Worker (Vercel Functions Job or Service):** performs scanning/uploading with retries.
- **Storage (S3-compatible object storage):** stages ZIP uploads and extracted files.
- **Database (Postgres):** job state, manifest pointers, dedupe registry.
- **Secrets (encrypted database token storage):** OAuth client secret and refresh token references.
- **Queue (Pub/Sub/QStash):** asynchronous handoff from API to worker.

## Resumability strategy

- Per-file status saved in manifest repository.
- Dedupe key persisted across restarts.
- `/pause` sets a cooperative stop flag (job status).
- `/resume` continues from last known status, skipping uploaded files.

## Rollback-safe deployment

- Keep prior Vercel Functions revision receiving 0–100% traffic split.
- Deploy new revision with no-traffic smoke test.
- Shift traffic gradually (10% → 50% → 100%).
- Roll back by moving traffic to prior revision instantly.
