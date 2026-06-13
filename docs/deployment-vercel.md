# Vercel Deployment: Free Browser-Only Mode

This project is deployed to Vercel as a static Vite app. There is no production FastAPI function, database, object bucket, queue, worker, Terraform, AWS, GCP, or other paid infrastructure in the primary deployment path.

The import runs in the user's browser:

1. Google Identity Services returns a short-lived Google Photos access token.
2. The user selects a Snapchat export ZIP from their computer.
3. The browser validates and reads the ZIP locally with the open-source `@zip.js/zip.js` library.
4. Supported photos/videos are uploaded directly from the browser to Google Photos.
5. Duplicate fingerprints and job reports stay in the browser profile.

## Architecture

| Area | Free Vercel implementation |
| --- | --- |
| Hosting | Vercel Hobby/static frontend |
| UI | React + Vite |
| ZIP processing | `@zip.js/zip.js` in the browser |
| Authentication | Google Identity Services browser OAuth |
| Media destination | Google Photos Library API |
| Persistence | Browser `localStorage` for duplicate fingerprints; generated reports are downloaded locally |
| Backend | Not used in the primary Vercel deployment |
| Database/object storage/queue | None |

The existing Python/FastAPI backend code remains in the repository for optional local or future backend-backed modes, but `vercel.json` intentionally deploys only the frontend. This avoids Vercel Function runtime, request body, filesystem, and long-running worker constraints.

## Why browser-only?

A Cloud Run design depended on services like durable object storage, a database, and a background queue. Replacing those with AWS, GCP, S3-compatible buckets, managed Postgres, or paid queue providers would violate the no-paid-infrastructure goal.

Vercel's static hosting is enough for this workflow because the user already has the ZIP locally and Google Photos is the final destination. Processing the archive in the browser keeps files off your servers and removes the need for paid staging storage.

## Prerequisites

- A Vercel account on the Hobby/free plan.
- A Google Cloud project with the Google Photos Library API enabled.
- A Google OAuth 2.0 Web application client ID.
- This repository connected to Vercel through GitHub.

Only the OAuth client ID is stored in Vercel. It is public by design for browser OAuth. Do not add a client secret to Vercel for this browser-only deployment.

## Google OAuth setup

In Google Cloud Console:

1. Open **APIs & Services > Library**.
2. Enable **Google Photos Library API**.
3. Open **APIs & Services > Credentials**.
4. Create or edit an **OAuth client ID**.
5. Choose **Web application**.
6. Add Authorized JavaScript origins:
   - `http://localhost:5173`
   - `https://<your-project>.vercel.app`
   - Any custom production domain you attach to Vercel.
   - Any preview domains you want to test, if your OAuth app policy allows them.
7. No redirect URI is required for the browser token flow used by the Vercel app.
8. Copy the client ID value ending in `.apps.googleusercontent.com`.

The frontend requests only:

```text
https://www.googleapis.com/auth/photoslibrary.appendonly
```

That scope permits uploads to the user's library but does not grant read/delete access.

## Vercel project setup

Create the Vercel project from GitHub:

1. Open Vercel and choose **Add New > Project**.
2. Import `vrajpatell/snap-export-to-google-photos-gcp`.
3. Use the repository root as the project root.
4. Keep the framework preset as **Other** or **Vite**. The checked-in `vercel.json` controls the commands.
5. Confirm these settings:

| Setting | Value |
| --- | --- |
| Install Command | `cd frontend && npm install` |
| Build Command | `cd frontend && npm run build` |
| Output Directory | `frontend/dist` |

The same settings are encoded in `vercel.json`:

```json
{
  "version": 2,
  "installCommand": "cd frontend && npm install",
  "buildCommand": "cd frontend && npm run build",
  "outputDirectory": "frontend/dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

## Vercel environment variables

Set this environment variable in Vercel Project Settings for **Production** and **Preview**:

| Name | Required | Value |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Yes | Google OAuth Web client ID |
| `VITE_API_BASE_URL` | No | Leave empty for browser-only Vercel mode |

Do not configure these for the free Vercel deployment:

- `DATABASE_URL`
- `PERSISTENCE_BACKEND`
- `STORAGE_BACKEND`
- `S3_*`
- `QSTASH_*`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `APP_SESSION_SECRET`
- `OAUTH_TOKEN_ENCRYPTION_KEY`

Those are only for the optional legacy/local backend path.

## Deploy

After the environment variable is saved:

1. Push to `main`, or click **Redeploy** in Vercel.
2. Open the Vercel deployment URL.
3. Click **Connect Google Photos**.
4. Select a small Snapchat export ZIP first.
5. Click **Validate ZIP locally**.
6. Click **Start browser import**.
7. Keep the browser tab open until the progress panel reaches a terminal status.
8. Download the JSON or CSV report.

## Local development

From the repository root:

```bash
cd frontend
cp .env.example .env.local
# edit .env.local and set VITE_GOOGLE_CLIENT_ID
npm install
npm run dev
```

Then open `http://localhost:5173`.

You do not need to start FastAPI for the free browser-only workflow.

Optional frontend checks:

```bash
cd frontend
npm run typecheck
npm run build
npm run test
```

## Operational notes

### Keep the tab open

The browser performs the import. Closing the tab, refreshing the page, sleeping the computer, or losing network connectivity can interrupt the run.

### Token expiry

Google browser access tokens are short-lived. If a long import starts failing with authorization errors, click **Refresh access token** and retry with the report as guidance.

### Duplicate detection

The app stores a local duplicate ledger in browser `localStorage` using ZIP path, uncompressed size, and modified time. This is free and private, but it is scoped to the current browser profile. Clearing site data resets the ledger.

### Large ZIP files

Large exports are limited by the user's browser memory, CPU, network speed, and Google Photos API behavior. For best results:

- Test with a small ZIP first.
- Keep the device awake.
- Prefer splitting extremely large exports into smaller ZIPs.
- Use a desktop browser for multi-GB exports.

### Reports

Reports are generated in the browser and downloaded as JSON or CSV. They are not uploaded to Vercel or stored on a server.

## What was intentionally removed from the Vercel path

- Vercel Python Functions for the import API.
- Server-side upload staging.
- Cloud/GCS/S3/R2 buckets.
- Firestore/Postgres job persistence.
- Cloud Tasks/QStash/background workers.
- Server-side OAuth refresh token storage.
- Docker/nginx/Cloud Run assumptions.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| **Connect Google Photos** says client ID is missing | Set `VITE_GOOGLE_CLIENT_ID` in Vercel and redeploy. |
| Google popup says origin is not allowed | Add the exact Vercel URL to Authorized JavaScript origins in Google Cloud Console. |
| Import fails with 401/403 | Refresh the Google access token and confirm the Photos Library API is enabled. |
| ZIP validation fails | Confirm the file is a real `.zip` Snapchat export. |
| Browser becomes slow | Split the export into smaller ZIP files or use a machine with more memory. |
| Duplicate detection seems reset | Browser storage may have been cleared or the import is running in a different browser profile. |

## Security model

- The OAuth client ID is public and safe to expose in a frontend app.
- No OAuth client secret is used.
- No refresh token is stored.
- ZIP files stay on the user's device.
- Media is sent directly from the user's browser to Google Photos over HTTPS.
- Vercel serves static assets only.
