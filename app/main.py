from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config.settings import settings
from app.core.middleware import RequestContextMiddleware
from app.utils.logging import configure_logging

configure_logging()
app = FastAPI(title=settings.app_name)
app.add_middleware(RequestContextMiddleware)
if settings.frontend_allowed_origins_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.frontend_allowed_origins_list),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    )
app.include_router(router)
