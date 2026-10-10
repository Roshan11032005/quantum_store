from __future__ import annotations

import hashlib
from datetime import timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.canonical import b64url_decode_no_pad, b64url_no_pad
from app.core.pqc import Signer
from app.core.security import challenge_payload, create_access_token, now_utc, random_nonce
from app.db.models import AuditLog, AuthChallenge, KeyType, User, UserKey


async def register_user(
    db: AsyncSession,
    username: str,
    kem_algorithm: str,
    kem_public_key_b64: str,
    sig_algorithm: str,
    sig_public_key_b64: str,
) -> tuple[User, str, str]:
    existing = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if existing is not None:
        raise ValueError("Username is already taken")

    user = User(username=username)
    db.add(user)
    await db.flush()

    kem_pk = b64url_decode_no_pad(kem_public_key_b64)
    sig_pk = b64url_decode_no_pad(sig_public_key_b64)

    kem_fpr = hashlib.sha256(kem_pk).hexdigest()
    sig_fpr = hashlib.sha256(sig_pk).hexdigest()

    db.add(
        UserKey(
            user_id=user.id,
            key_type=KeyType.kem,
            algorithm=kem_algorithm,
            public_key=kem_pk,
            public_key_sha256=kem_fpr,
            is_default=True,
        )
    )
    db.add(
        UserKey(
            user_id=user.id,
            key_type=KeyType.sig,
            algorithm=sig_algorithm,
            public_key=sig_pk,
            public_key_sha256=sig_fpr,
            is_default=True,
        )
    )
    db.add(AuditLog(user_id=user.id, action="register", detail={"username": username}))
    await db.commit()

    return user, kem_fpr, sig_fpr


async def issue_challenge(db: AsyncSession, username: str) -> AuthChallenge:
    settings = get_settings()
    user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    nonce = random_nonce(32)
    challenge = AuthChallenge(
        user_id=user.id if user else None,
        username_hint=username,
        nonce=nonce,
        expires_at=now_utc() + timedelta(seconds=settings.auth_challenge_ttl_seconds),
        used=False,
    )
    db.add(challenge)
    await db.commit()
    await db.refresh(challenge)
    return challenge


async def verify_challenge(db: AsyncSession, challenge_id: str, signature_b64: str) -> tuple[str, int]:
    challenge = (await db.execute(select(AuthChallenge).where(AuthChallenge.id == challenge_id))).scalar_one_or_none()
    if challenge is None or challenge.used:
        raise ValueError("Invalid challenge")
    expires_at = challenge.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        raise ValueError("Challenge expired")

    challenge.used = True

    if challenge.user_id is None:
        await db.commit()
        raise ValueError("Invalid authentication")

    user = (await db.execute(select(User).where(User.id == challenge.user_id))).scalar_one()
    sig_key = (
        await db.execute(
            select(UserKey).where(
                UserKey.user_id == user.id,
                UserKey.key_type == KeyType.sig,
                UserKey.is_default.is_(True),
                UserKey.revoked_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if sig_key is None:
        await db.commit()
        raise ValueError("No active signature key")

    signer = Signer(sig_key.algorithm)
    message = challenge_payload(user.username, challenge.nonce)
    signature = b64url_decode_no_pad(signature_b64)
    if not signer.verify(sig_key.public_key, message, signature):
        await db.commit()
        raise ValueError("Invalid authentication")

    token, expires_in = create_access_token(user.id)
    db.add(AuditLog(user_id=user.id, action="login", detail={"challenge_id": challenge_id}))
    await db.commit()
    return token, expires_in


def serialize_challenge(challenge: AuthChallenge, expires_in: int) -> dict[str, str | int]:
    return {
        "challenge_id": challenge.id,
        "nonce": b64url_no_pad(challenge.nonce),
        "expires_in": expires_in,
    }
