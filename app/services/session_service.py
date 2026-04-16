from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from google.auth.transport import requests
from google.oauth2 import id_token

from app.config.settings import settings
from app.utils.signed_tokens import SignedTokenService


@dataclass
class SessionToken:
    token: str
    email: str
    expires_at_epoch: int


class SessionService:
    def __init__(self) -> None:
        self._tokens: SignedTokenService | None = None

    def create_session_token(self, email: str) -> SessionToken:
        tokens = self._token_service()
        payload = {"sub": email.lower(), "type": "session"}
        token = tokens.sign(payload, ttl_seconds=settings.app_session_ttl_seconds)
        verified = tokens.verify(token)
        return SessionToken(
            token=token,
            email=email.lower(),
            expires_at_epoch=int(verified["exp"]),
        )

    def verify_session_token(self, token: str) -> str:
        payload = self._token_service().verify(token)
        if payload.get("type") != "session":
            raise ValueError("invalid session token type")
        email = str(payload.get("sub", "")).lower()
        if not email:
            raise ValueError("session token missing email")
        self._ensure_allowed_email(email)
        return email

    def verify_google_identity_token(self, credential: str) -> str:
        if not settings.google_oauth_client_id:
            raise ValueError("google oauth client is not configured")
        token_payload: dict[str, Any] = id_token.verify_oauth2_token(
            credential,
            requests.Request(),
            settings.google_oauth_client_id,
        )
        email = str(token_payload.get("email", "")).lower()
        if not token_payload.get("email_verified", False):
            raise ValueError("google account email is not verified")
        if not email:
            raise ValueError("google identity token did not include email")
        self._ensure_allowed_email(email)
        return email

    @staticmethod
    def enforce_auth_enabled() -> None:
        if not settings.enforce_user_auth:
            raise ValueError("user auth is not enabled")
        if not settings.app_session_secret:
            raise ValueError("app session secret is not configured")

    def _ensure_allowed_email(self, email: str) -> None:
        if not settings.allowed_user_emails_list:
            return
        normalized = {value.lower() for value in settings.allowed_user_emails_list}
        if email.lower() not in normalized:
            raise ValueError("signed-in email is not allowed")

    def _token_service(self) -> SignedTokenService:
        if not self._tokens:
            self._tokens = SignedTokenService(settings.app_session_secret)
        return self._tokens
