from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padded = value + ("=" * ((4 - (len(value) % 4)) % 4))
    return base64.urlsafe_b64decode(padded.encode("utf-8"))


class SignedTokenService:
    def __init__(self, secret: str) -> None:
        if not secret:
            raise ValueError("app session secret is not configured")
        self._secret = secret.encode("utf-8")

    def sign(self, payload: dict[str, Any], ttl_seconds: int) -> str:
        body = dict(payload)
        now = int(time.time())
        body["iat"] = now
        body["exp"] = now + ttl_seconds
        payload_bytes = json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
        payload_part = _b64url_encode(payload_bytes)
        signature_part = _b64url_encode(self._sign_bytes(payload_part.encode("utf-8")))
        return f"{payload_part}.{signature_part}"

    def verify(self, token: str) -> dict[str, Any]:
        parts = token.split(".")
        if len(parts) != 2:
            raise ValueError("invalid token format")
        payload_part, signature_part = parts
        expected = self._sign_bytes(payload_part.encode("utf-8"))
        actual = _b64url_decode(signature_part)
        if not hmac.compare_digest(expected, actual):
            raise ValueError("invalid token signature")

        payload = json.loads(_b64url_decode(payload_part).decode("utf-8"))
        exp = int(payload.get("exp", 0))
        if exp <= int(time.time()):
            raise ValueError("token expired")
        return payload

    def _sign_bytes(self, payload: bytes) -> bytes:
        return hmac.new(self._secret, payload, hashlib.sha256).digest()
