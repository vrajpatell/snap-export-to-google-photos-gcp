# Snap Export to Google Photos

Personal-use importer for moving Snapchat export media into Google Photos.

## Current Architecture

The primary deployment target is Vercel:

- React/Vite frontend built from `frontend/` and served as static output.
- FastAPI backend exposed from `api/index.py` as Vercel Python Functions.
- Browser ZIP uploads staged directly to S3-compatible object storage with presigned URLs.
- Postgres-compatible persistence for import jobs, manifests, dedupe state, and encrypted OAuth refresh tokens.
- Upstash QStash (or a compatible webhook queue) for production async import processing.
- Optional Google Identity-based application access.

Historical GCP/Cloud Run docs are archived under `docs/archive/` and are no longer the primary production path.

## Local Development

```bash
python -m pip install -e .[dev]
cp .env.example .env
uvicorn app.main:app --reload --port 8080
```

In another shell:

```bash
cd frontend
npm install
npm run dev
```

Local development defaults to in-memory repositories and `.localdata` staging. Production must use durable Postgres and object storage because Vercel filesystems are ephemeral.

## Browser Upload Flow

The public API contract is preserved:

1. `POST /staging/upload-url`
2. Browser uploads directly to the returned `upload_url`
3. `POST /staging/complete`
4. `POST /imports?staged_path=...`
5. `POST /imports/{job_id}/start`
6. Poll `GET /imports/{job_id}`

For same-origin Vercel deployments, `VITE_API_BASE_URL` may be empty. For separate deployments, set it to the backend Vercel URL.

## Deployment

See [`docs/deployment-vercel.md`](docs/deployment-vercel.md) for the production Vercel setup, required environment variables, Google OAuth redirect configuration, Postgres/object-storage/QStash setup, and limitations for large imports.

## Checks

```bash
ruff check .
mypy app
pytest -q
cd frontend && npm install && npm run typecheck && npm run build
```
