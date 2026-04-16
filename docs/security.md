# Security Notes

- No Snapchat login or credentials are used/stored.
- OAuth secrets are externalized to Secret Manager.
- ZIP extraction includes path traversal checks to prevent zip-slip.
- Uploaded file names are sanitized to basename in API layer.
- Request body limits should be enforced at Cloud Run + API middleware.
- Supported MIME/extensions are allowlisted; unsupported files are ignored and reported.
- Least-privilege IAM is defined in Terraform for service accounts.

## Frontend threat model and mitigations

### 1) Access control to the app UI/API
- Optional hard gate: `ENFORCE_USER_AUTH=true`
- App access requires Google Identity token verification on backend (`POST /auth/session/google`)
- Backend checks `ALLOWED_USER_EMAILS` allowlist and rejects non-approved accounts
- Session token is backend-signed (`APP_SESSION_SECRET`), short-lived, and verified server-side

### 2) Browser upload security
- Browser uploads directly to GCS with short-lived V4 signed URL (`POST /staging/upload-url`)
- Backend enforces:
  - filename sanitization
  - content-type allowlist (`STAGING_ALLOWED_CONTENT_TYPES`)
  - max upload size (`MAX_STAGED_UPLOAD_SIZE_MB`)
- Upload is finalized only after server-side object existence/size verification (`POST /staging/complete`)

### 3) Cross-origin protections
- CORS is allowlist-driven via `FRONTEND_ALLOWED_ORIGINS`
- Mutating requests with non-allowlisted `Origin` are rejected
- OAuth popup callback posts completion event only to configured `FRONTEND_BASE_URL`

### 4) OAuth state robustness
- OAuth state is signed + expiring token, not process memory
- This remains valid across Cloud Run instance scale-out/restarts

### 5) Secrets posture
- No OAuth client secret or refresh token is exposed to frontend bundle
- Required runtime secrets:
  - `google-oauth-client-id`
  - `google-oauth-client-secret`
  - `google-oauth-refresh-token`
  - `cloud-tasks-shared-token`
  - `app-session-secret`
