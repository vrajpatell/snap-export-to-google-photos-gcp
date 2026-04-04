from __future__ import annotations

import base64
import json

from google.cloud import tasks_v2


class TaskService:
    def __init__(
        self,
        client: tasks_v2.CloudTasksClient,
        project_id: str,
        region: str,
        queue: str,
        worker_url: str,
        worker_audience: str,
        service_account_email: str,
        task_token: str,
    ) -> None:
        self._client = client
        self._queue_path = client.queue_path(project_id, region, queue)
        self._worker_url = worker_url
        self._worker_audience = worker_audience
        self._service_account_email = service_account_email
        self._task_token = task_token

    def enqueue_process_job(self, job_id: str) -> str:
        payload = json.dumps({"job_id": job_id}).encode("utf-8")
        task = {
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": self._worker_url,
                "headers": {"Content-Type": "application/json", "X-Task-Token": self._task_token},
                "body": base64.b64encode(payload),
                "oidc_token": {
                    "service_account_email": self._service_account_email,
                    "audience": self._worker_audience,
                },
            }
        }
        created = self._client.create_task(request={"parent": self._queue_path, "task": task})
        return str(created.name)
