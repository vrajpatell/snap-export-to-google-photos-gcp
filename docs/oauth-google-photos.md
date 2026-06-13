# Google Photos OAuth setup

1. Enable **Google Photos Library API** in your Google project.
2. Configure the OAuth consent screen for the account that will import photos.
3. Create an OAuth Client ID of type **Web application**.
4. Add the Vercel frontend origin as an authorized JavaScript origin:
   - `https://<your-vercel-domain>`
5. Add the backend callback as an authorized redirect URI:
   - `https://<your-vercel-domain>/auth/google/callback`
6. Store `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REDIRECT_URI` in Vercel Project Settings.
7. Start auth:

```bash
curl -X POST https://<your-vercel-domain>/auth/google/start
```

Open the returned URL and complete consent. The refresh token is encrypted with `OAUTH_TOKEN_ENCRYPTION_KEY` and stored in the configured Postgres database.
