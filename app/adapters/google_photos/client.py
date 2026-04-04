from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

import httpx

from app.utils.retry import with_backoff


class GooglePhotosError(RuntimeError):
    """Raised when Google Photos API returns an error."""


@dataclass
class UploadResult:
    media_item_id: str
    uploaded_at: datetime


class GooglePhotosClient:
    def __init__(self, access_token_provider: Callable[[], str]) -> None:
        self._access_token_provider = access_token_provider

    def _headers(self) -> dict[str, str]:
        token = self._access_token_provider()
        return {"Authorization": f"Bearer {token}"}

    @with_backoff(retries=4)
    def upload_bytes(self, content: bytes, filename: str) -> str:
        headers = self._headers() | {
            "Content-type": "application/octet-stream",
            "X-Goog-Upload-Protocol": "raw",
            "X-Goog-Upload-File-Name": filename,
        }
        response = httpx.post("https://photoslibrary.googleapis.com/v1/uploads", headers=headers, content=content, timeout=60)
        response.raise_for_status()
        return response.text

    @with_backoff(retries=4)
    def create_media_item(self, upload_token: str, description: str = "") -> UploadResult:
        response = httpx.post(
            "https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate",
            headers=self._headers(),
            json={
                "newMediaItems": [
                    {
                        "description": description,
                        "simpleMediaItem": {"uploadToken": upload_token},
                    }
                ]
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        item = data["newMediaItemResults"][0]
        status = item.get("status", {})
        if status.get("code", 0) not in (0, None):
            raise GooglePhotosError(status.get("message", "Unknown Google Photos error"))
        media_item_id = item["mediaItem"]["id"]
        return UploadResult(media_item_id=media_item_id, uploaded_at=datetime.now(timezone.utc))
