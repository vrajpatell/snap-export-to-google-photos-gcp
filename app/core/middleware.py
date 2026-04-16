from __future__ import annotations

import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config.settings import settings


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        request.state.request_id = request_id

        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > settings.max_upload_size_mb * 1024 * 1024:
            return JSONResponse(status_code=413, content={"detail": "request too large"})

        origin = request.headers.get("origin")
        if (
            origin
            and settings.frontend_allowed_origins
            and origin not in settings.frontend_allowed_origins
            and request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}
        ):
            return JSONResponse(status_code=403, content={"detail": "origin is not allowed"})

        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response
