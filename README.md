# Snap Export to Google Photos

Personal-use importer for moving Snapchat export media into Google Photos from a static Vercel app.

## Current Architecture

The primary deployment target is Vercel static hosting:

- React/Vite frontend built from `frontend/` and served from `frontend/dist`.
- Google Identity Services browser OAuth for a short-lived Google Photos access token.
- Browser-local ZIP processing with the open-source `@zip.js/zip.js` library.
- Direct browser uploads to the Google Photos Library API.
- Browser-local duplicate tracking and downloadable JSON/CSV reports.
- No production database, object bucket, server-side queue, worker, or Docker image in the Vercel path.

The Python/FastAPI backend remains in the repository for optional local or legacy experimentation, but Vercel deploys only the static frontend in the primary free stack.

## Local Development

Frontend-only development for the Vercel workflow:

```bash
cd frontend
cp .env.example .env.local
# Set VITE_GOOGLE_CLIENT_ID in .env.local
npm install
npm run dev
```

Open `http://localhost:5173` and add that origin to the Google OAuth Web client.

Optional backend development remains available separately:

```bash
python -m pip install -e .[dev]
cp .env.example .env
uvicorn app.main:app --reload --port 8080
```

## Browser Import Flow

The Vercel app does not stage ZIP files on a server. The browser flow is:

1. Connect Google Photos with the browser OAuth client.
2. Select a Snapchat export ZIP from your computer.
3. Validate the ZIP locally.
4. Start the browser import.
5. Keep the tab open while media uploads directly to Google Photos.
6. Download the JSON/CSV report when the run reaches a terminal status.

## Deployment

See [`docs/deployment-vercel.md`](docs/deployment-vercel.md) for the production Vercel setup, Google OAuth configuration, required environment variables, troubleshooting, and limitations for large imports.

## Checks

```bash
ruff check .
mypy app
pytest -q
cd frontend && npm install && npm run typecheck && npm run build
```
