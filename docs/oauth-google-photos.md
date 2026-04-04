# Google Photos OAuth setup

1. Enable **Google Photos Library API** in the same project.
2. Configure OAuth consent screen (External or Internal single-user test).
3. Create OAuth Client ID (Web).
4. Add redirect URI:
   - `https://<api-cloud-run-url>/auth/google/callback`
5. Store secrets:
```bash
echo -n "$GOOGLE_OAUTH_CLIENT_ID" | gcloud secrets versions add google-oauth-client-id --data-file=-
echo -n "$GOOGLE_OAUTH_CLIENT_SECRET" | gcloud secrets versions add google-oauth-client-secret --data-file=-
```
6. Start auth:
```bash
curl -X POST https://<api-url>/auth/google/start
```
Open the returned URL, complete consent, then call callback endpoint.
Refresh token is stored in Secret Manager secret `google-oauth-refresh-token`.
