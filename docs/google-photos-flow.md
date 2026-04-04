# Google Photos Upload Flow

1. User calls `POST /auth/google/start`.
2. User consents on Google page.
3. Google redirects to `GET /auth/google/callback` with `code` + `state`.
4. Service exchanges auth code for refresh token (production: token endpoint).
5. Worker uploads media using:
   - `POST /v1/uploads` for bytes
   - `POST /v1/mediaItems:batchCreate` for media item creation
6. Optional album assignment performed after upload.
