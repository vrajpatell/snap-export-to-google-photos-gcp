# Vercel Deployment

This repository now uses a single Vercel project: Vite builds `frontend/dist`, and Vercel routes API requests to the FastAPI ASGI app exposed by `api/index.py`.

## Architecture

- Frontend: React/Vite static output.
- API: FastAPI on Vercel Python Functions.
- Database: Postgres-compatible service for jobs, manifests, dedupe records, and encrypted OAuth refresh tokens.
- Object storage: S3-compatible bucket (AWS S3, Cloudflare R2, or similar) with presigned browser uploads.
- Queue: Upstash QStash for async `/tasks/process` webhook delivery.

Vercel Functions have ephemeral filesystems and finite runtime windows, so production must not rely on `.localdata` or a long-lived worker process. Large imports should be split into small enough jobs for the configured function duration, or moved to an external Vercel-compatible worker.

## Vercel Project Settings

Use the repo root as the project root. `vercel.json` sets:

- Build command: `cd frontend && npm install && npm run build`
- Output directory: `frontend/dist`
- API function: `api/index.py`

## Environment Variables

Set these in Vercel Project Settings for Production and Preview:

- `ENV=production`
- `APP_BASE_URL=https://<your-vercel-domain>`
- `FRONTEND_BASE_URL=https://<your-vercel-domain>`
- `FRONTEND_ALLOWED_ORIGINS=https://<your-vercel-domain>,https://<preview-domain>`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI=https://<your-vercel-domain>/auth/google/callback`
- `APP_SESSION_SECRET`
- `OAUTH_TOKEN_ENCRYPTION_KEY` (a Fernet key)
- `PERSISTENCE_BACKEND=postgres`
- `DATABASE_URL`
- `STORAGE_BACKEND=s3`
- `S3_STAGING_BUCKET`, `S3_REGION`, and either IAM/environment credentials or `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`
- `S3_ENDPOINT_URL` when using R2 or another S3-compatible endpoint
- `QUEUE_BACKEND=qstash`
- `QSTASH_TOKEN`
- `QSTASH_WORKER_URL=https://<your-vercel-domain>/tasks/process`

`BLOB_READ_WRITE_TOKEN` is intentionally not used by the production path because Snapchat ZIP exports can be large and need standard presigned `PUT` semantics; S3/R2 is the documented durable staging backend.

## Google OAuth Setup

In Google Cloud Console, configure an OAuth web client with:

- Authorized JavaScript origin: `https://<your-vercel-domain>`
- Authorized redirect URI: `https://<your-vercel-domain>/auth/google/callback`

Keep the Google Photos scopes unchanged unless Google requires app verification changes.

## Local Development

Copy `.env.example` to `.env`, keep `PERSISTENCE_BACKEND=memory` and `STORAGE_BACKEND=local`, then run:

```bash
uvicorn app.main:app --reload --port 8080
cd frontend && npm install && npm run dev
```

The local browser upload flow remains `POST /staging/upload-url`, direct `PUT`, `POST /staging/complete`, `POST /imports?staged_path=...`, and `POST /imports/{job_id}/start`.

## Production Checklist

1. Create Postgres and object storage resources.
2. Create an Upstash QStash token.
3. Add all Vercel environment variables.
4. Add the Vercel production and preview domains to Google OAuth and `FRONTEND_ALLOWED_ORIGINS`.
5. Deploy through Vercel Git integration.
6. Test `/healthz`, OAuth start/callback, upload staging, import creation, and progress polling.

## Limitations

Vercel Python Functions are not long-lived worker containers. This app enqueues production import starts to QStash, but each processing invocation must still fit within Vercel's function limits. For very large exports, use smaller staged ZIPs or run `/tasks/process` on an external worker compatible with the same Postgres/object-storage settings.
