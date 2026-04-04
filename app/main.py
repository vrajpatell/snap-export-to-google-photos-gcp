from __future__ import annotations

from fastapi import FastAPI

from app.api.routes import router
from app.config.settings import settings
from app.core.middleware import RequestContextMiddleware
from app.utils.logging import configure_logging

configure_logging()
app = FastAPI(title=settings.app_name)
app.add_middleware(RequestContextMiddleware)
app.include_router(router)
