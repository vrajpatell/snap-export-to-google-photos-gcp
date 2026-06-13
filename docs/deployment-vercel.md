# Free Public Browser-Only Vercel Deployment

This project is deployed to Vercel as a public static Vite app. There is no production FastAPI function, database, object bucket, queue, worker, Terraform, AWS, GCP, or other paid infrastructure in the primary deployment path.

You do **not** need to buy a domain. Vercel provides a production URL such as:

```text
https://<your-project>.vercel.app
```

Use that Vercel production URL as the public app URL. For Google OAuth, copy the exact origin only: include `https://`, but do not include a path, query string, trailing slash, or wildcard.

## Architecture

| Area | Free implementation |
| --- | --- |
| Hosting | Vercel Hobby/static frontend |
| Public URL | Default Vercel production URL: `https://<your-project>.vercel.app` |
| UI | React + Vite |
| ZIP processing | Browser with open-source `@zip.js/zip.js` |
| Auth | Google Identity Services token model |
| Upload destination | Google Photos Library API |
| Persistence | Browser `localStorage` for duplicate fingerprints; generated reports are downloaded locally |
| Backend | Not used in the primary Vercel deployment |
| Database/object storage/queue | None |

The import runs in the user's browser:

1. Google Identity Services returns a short-lived Google Photos access token.
2. The user selects a Snapchat export ZIP from their computer.
3. The browser validates and reads the ZIP locally.
4. Supported photos/videos are uploaded directly from the browser to Google Photos.
5. Duplicate fingerprints and job reports stay in the browser profile.

The existing Python/FastAPI backend code remains in the repository for optional local or future backend-backed modes, but `vercel.json` intentionally deploys only the frontend. Do not add Vercel Functions for the free public deployment.

## Why browser-only?

A Cloud Run design depended on services like durable object storage, a database, and a background queue. Replacing those with AWS, GCP, S3-compatible buckets, managed Postgres, or paid queue providers would violate the no-paid-infrastructure goal.

Vercel's static hosting is enough for this workflow because the user already has the ZIP locally and Google Photos is the final destination. Processing the archive in the browser keeps files off your servers and removes the need for paid staging storage.

## Prerequisites

- A Vercel account on the Hobby/free plan.
- A Google Cloud project with the Google Photos Library API enabled.
- A Google OAuth 2.0 Web application client ID.
- This public GitHub repository connected to Vercel.

Only the OAuth client ID is stored in Vercel. It is public by design for browser OAuth. Do not add a client secret to Vercel for this browser-only deployment.

## Google setup

### 1. Enable the Photos API

In Google Cloud Console:

1. Open **APIs & Services > Library**.
2. Enable **Google Photos Library API**.

### 2. Configure app audience for public use

If this app should be available to anyone with a Google Account:

1. Open **Google Auth Platform > Audience**.
2. Set **User type** to **External**.
3. Set **Publishing status** to **In production** when you are ready for users beyond test users.

If the app stays in **Testing**, only listed test users can authorize the Photos scope. That is useful during development but not enough for a public app.

Google may show an unverified-app warning or require verification depending on scopes, branding, and user volume. This does not require paid hosting, but it may affect public rollout.

### 3. Create the OAuth Web client

1. Open **APIs & Services > Credentials** or **Google Auth Platform > Clients**.
2. Create or edit an **OAuth client ID**.
3. Choose **Web application**.
4. Add Authorized JavaScript origins:
   - `http://localhost:5173`
   - `https://<your-project>.vercel.app`
   - Any Vercel preview URL you explicitly want to test.
5. Enter origins only. Do not include a path, query string, trailing slash, or wildcard.
6. No redirect URI is required for the browser token flow used by this app.
7. Copy the client ID value ending in `.apps.googleusercontent.com`.

The frontend requests only:

```text
https://www.googleapis.com/auth/photoslibrary.appendonly
```

That scope permits uploads to the user's library but does not grant read/delete access.

## Vercel project setup

Create the Vercel project from GitHub:

1. Open Vercel.
2. Choose **Add New > Project**.
3. Import `vrajpatell/snap-export-to-google-photos-gcp`.
4. Use the repository root as the project root.
5. Keep the framework preset as **Other** or **Vite**. The checked-in `vercel.json` controls the commands.
6. Confirm these settings:

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

The SPA rewrite lets direct visits and refreshes resolve to the React app.

## Vercel environment variables

Set this environment variable in Vercel Project Settings for **Production** and **Preview**:

| Name | Required | Value |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Yes | Google OAuth Web client ID |
| `VITE_API_BASE_URL` | No | Leave empty or unset for browser-only Vercel mode |

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
- Any `GCP_*`, `GOOGLE_CLOUD_*`, bucket, project, Cloud Tasks, Secret Manager, Cloud Run, or Terraform deployment variables

Those are only for optional legacy/local backend experiments.

## Deploy to the default Vercel production URL

1. Save `VITE_GOOGLE_CLIENT_ID` in Vercel.
2. Deploy `main`.
3. Open the generated production URL, usually:

```text
https://<your-project>.vercel.app
```

4. Copy the exact origin, including `https://` and no trailing slash.
5. Add that exact origin to the OAuth Web client's **Authorized JavaScript origins**.
6. Wait a few minutes if Google says the origin is still mismatched.
7. Open the Vercel production URL again and click **Connect Google Photos**.

No custom domain is required. Do not buy a domain unless you later want branded URLs.

## Make the app available to anyone

For a public app:

- Keep the GitHub repository public, or connect your private repo to Vercel and deploy publicly.
- Keep Vercel production deployment protection/password protection disabled.
- Do not enable Vercel Authentication on the production deployment.
- Use the generated `https://<your-project>.vercel.app` URL as the public URL.
- Configure Google OAuth as **External** and **In production** when ready for non-test users.
- Add the exact Vercel production origin to Authorized JavaScript origins.

Every visitor still authorizes their own Google Photos account. The app does not use your Google account, store other users' files, store access tokens, or store refresh tokens.

## Smoke test after deployment

1. Open `https://<your-project>.vercel.app` in a regular browser window.
2. Click **Connect Google Photos**.
3. Confirm Google shows your OAuth app and the `photoslibrary.appendonly` permission.
4. Select a small Snapchat export ZIP first.
5. Click **Validate ZIP locally**.
6. Click **Start browser import**.
7. Keep the browser tab open until the progress panel reaches a terminal status.
8. Download the JSON or CSV report.
9. Confirm the uploaded media appears in the signed-in user's Google Photos library.

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
- Frontend API client wrappers for `/imports`, `/staging`, and server OAuth.
- Cloud/GCS/S3/R2 buckets.
- Firestore/Postgres job persistence.
- Cloud Tasks/QStash/background workers.
- Server-side OAuth refresh token storage.
- Docker/nginx/Cloud Run assumptions.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| **Connect Google Photos** says client ID is missing | Set `VITE_GOOGLE_CLIENT_ID` in Vercel and redeploy. |
| Google popup says origin is not allowed | Add the exact `https://<your-project>.vercel.app` origin to Authorized JavaScript origins. Do not include a path or trailing slash. |
| App works for you but not other users | Change Google OAuth audience to External and publishing status to In production, then complete any required verification steps. |
| Popup is blocked or closes | Allow popups for the Vercel origin and click **Connect Google Photos** again. |
| Import fails with 401/403 | Click **Refresh access token**, confirm the Photos Library API is enabled, and verify the OAuth app granted `photoslibrary.appendonly`. |
| Import hits 429 | Google rate-limited the app/user. Wait a few minutes and retry failed rows from the local report. |
| Import hits 5xx | Google Photos had a temporary service error. The app retries with backoff; retry later if failures remain. |
| ZIP validation fails | Confirm the file is a real `.zip` Snapchat export and is not corrupt or partially downloaded. |
| Browser slow/out of memory | Split the export into smaller ZIP files, use a desktop browser, and keep the device awake. |
| Duplicate ledger reset | Browser storage may have been cleared or the import is running in a different browser profile; duplicate detection starts fresh. |
| Build fails on Vercel | Confirm Vercel uses the checked-in `vercel.json`, Node can install `frontend/package-lock.json`, and `VITE_GOOGLE_CLIENT_ID` is set for the target environment. |

## Security model

- The OAuth client ID is public and safe to expose in a frontend app.
- No OAuth client secret is used.
- No refresh token is stored.
- ZIP files stay on the user's device.
- Media is sent directly from the user's browser to Google Photos over HTTPS.
- Vercel serves static assets only.
