from __future__ import annotations

import httpx

from app.config.settings import settings


class TaskService:
    def enqueue_process_job(self, job_id: str) -> str:
        if settings.queue_backend != "qstash":
            raise ValueError("QUEUE_BACKEND must be qstash to enqueue background imports")
        if not settings.qstash_token:
            raise ValueError("QSTASH_TOKEN is required for qstash queueing")
        worker_url = (
            settings.qstash_worker_url or f"{settings.app_base_url.rstrip('/')}/tasks/process"
        )
        response = httpx.post(
            f"https://qstash.upstash.io/v2/publish/{worker_url}",
            headers={
                "Authorization": f"Bearer {settings.qstash_token}",
                "Content-Type": "application/json",
            },
            json={"job_id": job_id},
            timeout=30,
        )
        response.raise_for_status()
        return str(response.json().get("messageId", "queued"))
