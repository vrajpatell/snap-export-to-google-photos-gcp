from __future__ import annotations

import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

from app.config.settings import settings


@dataclass
class OAuthStart:
    authorization_url: str
    state: str


class OAuthService:
    def __init__(self) -> None:
        self._state: str | None = None
        self._refresh_token: str | None = None

    def start(self) -> OAuthStart:
        state = secrets.token_urlsafe(24)
        self._state = state
        params = {
            "client_id": "set-via-secret-manager",
            "redirect_uri": settings.google_oauth_redirect_uri,
            "response_type": "code",
            "scope": " ".join(settings.google_oauth_scopes),
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        return OAuthStart(
            authorization_url=f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}",
            state=state,
        )

    def exchange_code(self, code: str, state: str) -> str:
        if self._state != state:
            raise ValueError("invalid oauth state")
        # In production, exchange with Google's token endpoint and store in Secret Manager.
        self._refresh_token = f"refresh-{code}"
        return self._refresh_token

    def access_token(self) -> str:
        if not self._refresh_token:
            raise ValueError("google oauth has not been completed")
        return "mock-access-token"
