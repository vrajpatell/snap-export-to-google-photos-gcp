# Operations

## Pause/resume/retry

- Pause: `POST /imports/{job_id}/pause`
- Resume: `POST /imports/{job_id}/resume` (enqueues QStash when `QUEUE_BACKEND=qstash`)
- Retry failed jobs by calling resume again; dedupe keys use sha256+size+timestamp for idempotency.

## Troubleshooting

- 401 on `/tasks/process`: verify queue webhook headers and any configured `TASK_TOKEN` checks.
- OAuth token errors: ensure the Google redirect URI exactly matches `GOOGLE_OAUTH_REDIRECT_URI`.
- Postgres errors: verify `DATABASE_URL`, SSL requirements, and database permissions.
- Missing staged files: verify `STORAGE_BACKEND=s3`, bucket credentials, and object lifecycle rules.

## Cost awareness (personal use)

- Keep Vercel usage within Hobby/Pro function limits.
- Prefer lifecycle rules that delete staging objects after imports are complete.
- Split very large Snapchat exports into smaller ZIPs when processing exceeds function duration.

## Observability checks

- Check Vercel Function logs for `/tasks/process` errors.
- Check QStash delivery logs for retries and non-2xx webhook responses.
- Monitor Postgres connection usage and storage bucket size.
