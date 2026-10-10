from __future__ import annotations

import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.config import get_settings

LOGIN_CONTEXT = b"pqc-storage-login-v1"


class TokenError(Exception):
    pass


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(subject: str) -> tuple[str, int]:
    settings = get_settings()
    expires_delta = timedelta(minutes=settings.jwt_expire_minutes)
    expiry = now_utc() + expires_delta
    payload = {
        "sub": subject,
        "jti": str(uuid.uuid4()),
        "exp": expiry,
        "iat": now_utc(),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    return token, int(expires_delta.total_seconds())


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise TokenError("Invalid or expired access token") from exc


def random_nonce(nbytes: int = 32) -> bytes:
    return secrets.token_bytes(nbytes)


def challenge_payload(username: str, nonce: bytes) -> bytes:
    return LOGIN_CONTEXT + nonce + username.encode("utf-8")


def constant_time_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)
