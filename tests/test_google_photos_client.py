from __future__ import annotations

import httpx

from app.adapters.google_photos.client import GooglePhotosClient


def test_google_photos_two_step_upload(monkeypatch) -> None:
    calls: list[str] = []

    def fake_post(url: str, **kwargs):  # type: ignore[no-untyped-def]
        calls.append(url)
        if url.endswith("/uploads"):
            return httpx.Response(200, text="upload-token")
        return httpx.Response(
            200,
            json={
                "newMediaItemResults": [
                    {
                        "mediaItem": {"id": "media-1"},
                        "status": {"code": 0},
                    }
                ]
            },
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    client = GooglePhotosClient(access_token_provider=lambda: "token")
    upload_token = client.upload_bytes(b"abc", "snap.jpg")
    result = client.create_media_item(upload_token)

    assert upload_token == "upload-token"
    assert result.media_item_id == "media-1"
    assert any(url.endswith("/uploads") for url in calls)
