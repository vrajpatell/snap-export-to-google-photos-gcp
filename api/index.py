from __future__ import annotations

from app.main import app

# Vercel's Python runtime imports this ASGI app for all /api routes.
handler = app
