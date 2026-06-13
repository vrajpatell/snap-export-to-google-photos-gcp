from __future__ import annotations

import secrets
from dataclasses import dataclass

import httpx
from cryptography.fernet import Fernet, InvalidToken

from app.config.settings import settings
from app.utils.signed_tokens import SignedTokenService


@dataclass
class OAuthStart:
    authorization_url: str
    state: str


class OAuthService:
    def __init__(self, token_repo=None) -> None:  # type: ignore[no-untyped-def]
        self._tokens: SignedTokenService | None = None
        self._token_repo = token_repo

    def start(self, requested_by: str | None = None, flow: str = "api") -> OAuthStart:
        nonce = secrets.token_urlsafe(18)
        state = self._token_service().sign(
            {
                "type": "oauth_state",
                "nonce": nonce,
                "requested_by": requested_by.lower() if requested_by else "",
                "flow": flow,
            },
            ttl_seconds=600,
        )
        params = {
            "client_id": settings.google_oauth_client_id,
            "redirect_uri": settings.google_oauth_redirect_uri,
            "response_type": "code",
            "scope": " ".join(settings.photos_oauth_scopes_list),
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        return OAuthStart(
            # Use plain string conversion for compatibility across httpx versions.
            authorization_url=str(
                httpx.URL("https://accounts.google.com/o/oauth2/v2/auth", params=params)
            ),
            state=state,
        )

    def exchange_code(self, code: str, state: str) -> str:
        payload = self._token_service().verify(state)
        if payload.get("type") != "oauth_state":
            raise ValueError("invalid oauth state")
        if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
            raise ValueError("google oauth client is not configured")

        response = httpx.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "redirect_uri": settings.google_oauth_redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=30,
        )
        response.raise_for_status()
        refresh_token = response.json().get("refresh_token")
        if not refresh_token:
            raise ValueError("oauth token response did not include a refresh token")
        self._store_refresh_token(refresh_token)
        return f"db:{settings.oauth_token_name}"

    def callback_flow(self, state: str) -> str:
        payload = self._token_service().verify(state)
        if payload.get("type") != "oauth_state":
            raise ValueError("invalid oauth state")
        flow = str(payload.get("flow", "api"))
        return flow if flow in {"api", "web"} else "api"

    def access_token(self) -> str:
        refresh_token = self._load_refresh_token()
        if not refresh_token:
            raise ValueError("google oauth has not been completed")
        response = httpx.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=30,
        )
        response.raise_for_status()
        access_token = response.json().get("access_token")
        if not access_token:
            raise ValueError("oauth token response missing access_token")
        return access_token

    def _store_refresh_token(self, refresh_token: str) -> None:
        if not self._token_repo:
            raise ValueError("oauth token repository is not configured")
        self._token_repo.save_refresh_token(
            settings.oauth_token_name, self._encrypt_refresh_token(refresh_token)
        )

    def _load_refresh_token(self) -> str:
        if not self._token_repo:
            return ""
        encrypted = self._token_repo.load_refresh_token(settings.oauth_token_name)
        if not encrypted:
            return ""
        return self._decrypt_refresh_token(encrypted)

    def _fernet(self) -> Fernet:
        key = settings.oauth_token_encryption_key or settings.app_session_secret
        if not key:
            raise ValueError("OAUTH_TOKEN_ENCRYPTION_KEY or APP_SESSION_SECRET is required")
        try:
            return Fernet(key.encode("utf-8"))
        except ValueError as exc:
            raise ValueError("OAUTH_TOKEN_ENCRYPTION_KEY must be a Fernet key") from exc

    def _encrypt_refresh_token(self, refresh_token: str) -> str:
        return self._fernet().encrypt(refresh_token.encode("utf-8")).decode("utf-8")

    def _decrypt_refresh_token(self, encrypted_refresh_token: str) -> str:
        try:
            return self._fernet().decrypt(encrypted_refresh_token.encode("utf-8")).decode("utf-8")
        except InvalidToken as exc:
            raise ValueError("stored oauth refresh token cannot be decrypted") from exc

    def _token_service(self) -> SignedTokenService:
        if not self._tokens:
            self._tokens = SignedTokenService(settings.app_session_secret)
        return self._tokens
