# Snap Export to Google Photos

Move Snapchat export media into Google Photos with a **free, public, static Vercel deployment**. The primary app is a React + Vite frontend that runs the import in the browser: no production backend, no Vercel Functions, no Cloud Run, no databases, no object buckets, and no hosted queues.

## Primary architecture

- **Hosting:** Vercel static hosting/Hobby plan serving `frontend/dist`.
- **Public URL:** the default Vercel production URL, for example `https://<your-project>.vercel.app`; no paid custom domain is required.
- **UI:** React + Vite from `frontend/`.
- **Auth:** Google Identity Services browser token flow with `VITE_GOOGLE_CLIENT_ID` only.
- **ZIP processing:** local browser processing with open-source `@zip.js/zip.js`.
- **Uploads:** browser sends media bytes directly to the Google Photos Library API.
- **Persistence:** duplicate ledger in browser storage; JSON/CSV reports downloaded locally.
- **Backend:** not used for the free Vercel deployment.

The Python/FastAPI backend remains only for optional legacy/local experimentation. It is not required to deploy or run the free Vercel workflow.

## Browser import flow

1. Connect Google Photos with the browser OAuth client.
2. Select a Snapchat export ZIP from your computer.
3. Validate the ZIP locally in the browser.
4. Start the import and keep the browser tab open.
5. Supported photos/videos upload directly from your browser to Google Photos.
6. Download the JSON or CSV report when the run completes, completes with errors, fails, or is cancelled.

Unsupported files are skipped with reasons in the report. Duplicate detection is local to the current browser profile; clearing browser storage resets it.

## Deploy to Vercel for free

Follow the step-by-step guide in [`docs/deployment-vercel.md`](docs/deployment-vercel.md). In short:

1. Import this public GitHub repository into Vercel.
2. Use the repository root and the checked-in `vercel.json`.
3. Set only this required production/preview environment variable:

```text
VITE_GOOGLE_CLIENT_ID=your-oauth-web-client-id.apps.googleusercontent.com
```

`VITE_API_BASE_URL` can stay empty or unset for the browser-only deployment.

After the first Vercel production deployment, copy the generated `https://<your-project>.vercel.app` URL and add that exact origin to the Google OAuth Web client's **Authorized JavaScript origins**. Keep Vercel deployment protection/password protection disabled if the app should be available to anyone.

Do **not** provision GCP/AWS runtime infrastructure, Postgres, S3/R2/GCS buckets, QStash, hosted queues, Vercel Blob, or Vercel Functions for the primary path.

## Local frontend development

```bash
cd frontend
cp .env.example .env.local
# Set VITE_GOOGLE_CLIENT_ID in .env.local
npm install
npm run dev
```

Open `http://localhost:5173` and add that origin to the Google OAuth Web client's Authorized JavaScript origins.

## Public access checklist

- Vercel production deployment is reachable at `https://<your-project>.vercel.app`.
- Vercel deployment protection is disabled for production.
- Google OAuth audience is **External**.
- Google OAuth publishing status is **In production** if users beyond test users need to authorize the Photos scope.
- The exact Vercel production origin is listed in the OAuth Web client's Authorized JavaScript origins.

## Optional legacy backend development

Only use this if you are intentionally experimenting with the old local FastAPI code:

```bash
python -m pip install -e .[dev]
cp .env.example .env
uvicorn app.main:app --reload --port 8080
```

Backend, Docker, and archived GCP documentation are legacy/local references and are not part of the static Vercel deployment.

## Checks

```bash
cd frontend && npm install
cd frontend && npm run typecheck
cd frontend && npm run build
cd frontend && npm run test
```
