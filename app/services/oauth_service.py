from __future__ import annotations

import secrets
from dataclasses import dataclass

import httpx
from google.cloud import secretmanager

from app.config.settings import settings
from app.utils.signed_tokens import SignedTokenService


@dataclass
class OAuthStart:
    authorization_url: str
    state: str


class OAuthService:
    def __init__(self) -> None:
        self._tokens: SignedTokenService | None = None

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
            authorization_url=httpx.URL(
                "https://accounts.google.com/o/oauth2/v2/auth", params=params
            ).human_repr(),
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
        return f"secret:{settings.oauth_token_secret_id}"

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
        if not settings.gcp_project_id:
            return
        client = secretmanager.SecretManagerServiceClient()
        parent = f"projects/{settings.gcp_project_id}/secrets/{settings.oauth_token_secret_id}"
        client.add_secret_version(parent=parent, payload={"data": refresh_token.encode("utf-8")})

    def _load_refresh_token(self) -> str:
        if not settings.gcp_project_id:
            return ""
        client = secretmanager.SecretManagerServiceClient()
        name = (
            f"projects/{settings.gcp_project_id}/secrets/"
            f"{settings.oauth_token_secret_id}/versions/latest"
        )
        response = client.access_secret_version(name=name)
        return response.payload.data.decode("utf-8")

    def _token_service(self) -> SignedTokenService:
        if not self._tokens:
            self._tokens = SignedTokenService(settings.app_session_secret)
        return self._tokens
