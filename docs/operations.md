# Operations

## Pause/resume/retry
- Pause: `POST /imports/{job_id}/pause`
- Resume: `POST /imports/{job_id}/resume` (enqueues Cloud Task)
- Retry failed jobs by calling resume again; dedupe key uses sha256+size+timestamp for idempotency.

## Troubleshooting
- 401 on `/tasks/process`: verify `CLOUD_TASKS_TASK_TOKEN` secret/value.
- OAuth token errors: ensure redirect URI exact match and secrets configured.
- Firestore permission errors: runtime SA needs `roles/datastore.user`.

## Cost awareness (personal use)
- Keep min instances at 0.
- Use one small Cloud Run revision (CPU 1, memory 512Mi where possible).
- Keep bucket lifecycle rules to delete staging artifacts after import.

## Observability checks
- Dashboard: `Snap Import Overview` in Cloud Monitoring.
- Uptime check target: API `/readyz`.
- Alerts: API uptime failures and API 5xx responses.
