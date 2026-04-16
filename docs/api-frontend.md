# Frontend API Endpoints

## App access session (optional hard gate)

### `POST /auth/session/google`
Verify Google Identity credential and mint app session token.

Request:
```json
{
  "id_token": "<google_identity_jwt>"
}
```

Response:
```json
{
  "session_token": "<signed-session-token>",
  "email": "you@example.com",
  "expires_at": "2026-04-16T12:00:00+00:00"
}
```

Use `Authorization: Bearer <session_token>` when `ENFORCE_USER_AUTH=true`.

## Google Photos OAuth connection

### `POST /auth/google/start`
Request with `{"flow":"web"}` for popup completion mode.

Response includes Google OAuth URL.

### `GET /auth/google/callback`
Handles code exchange and stores refresh token in Secret Manager.

## Direct staging upload flow

### `POST /staging/upload-url`
Mint short-lived signed upload URL.

Request:
```json
{
  "filename": "snap-export.zip",
  "content_type": "application/zip",
  "size_bytes": 123456789
}
```

Response:
```json
{
  "upload_url": "https://storage.googleapis.com/...",
  "object_path": "uploads/2026/04/16/<uuid>-snap-export.zip",
  "method": "PUT",
  "required_headers": {
    "Content-Type": "application/zip"
  },
  "expires_at": "2026-04-16T12:00:00+00:00"
}
```

### `PUT <upload_url>`
Upload browser file directly to GCS.

### `POST /staging/complete`
Validate uploaded object exists and matches expected size.

Request:
```json
{
  "object_path": "uploads/2026/04/16/<uuid>-snap-export.zip",
  "size_bytes": 123456789
}
```

Response:
```json
{
  "staged_path": "gcs://<bucket>/uploads/2026/04/16/<uuid>-snap-export.zip"
}
```

## Import + progress polling

1. `POST /imports?staged_path=<staged_path>`
2. `POST /imports/{job_id}/start`
3. Poll `GET /imports/{job_id}` every 2-5s until status in:
   - `completed`
   - `partially_completed`
   - `failed`
   - `cancelled`

Progress bar formula:
- numerator: `counters.uploaded_count`
- denominator: `counters.supported_files`
