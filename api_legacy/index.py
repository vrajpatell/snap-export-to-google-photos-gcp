from __future__ import annotations

from app.main import app

# Legacy ASGI entrypoint retained for optional backend experiments.
# The primary Vercel deployment is static/browser-only and does not route to this file.
handler = app
