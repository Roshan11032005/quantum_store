from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.canonical import b64url_decode_no_pad, b64url_no_pad
from app.db.models import KeyType, User, UserKey
from app.db.session import get_db_session
from app.deps import get_current_user

router = APIRouter(prefix="/users", tags=["users"])


class AddKeyRequest(BaseModel):
    key_type: str
    algorithm: str
    public_key: str
    make_default: bool = False


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "id": current_user.id,
        "username": current_user.username,
        "created_at": current_user.created_at,
        "is_active": current_user.is_active,
    }


@router.get("/me/keys")
async def my_keys(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db_session)
) -> list[dict]:
    keys = (
        await db.execute(
            select(UserKey).where(UserKey.user_id == current_user.id).order_by(UserKey.created_at.desc())
        )
    ).scalars()
    return [
        {
            "id": key.id,
            "key_type": key.key_type.value,
            "algorithm": key.algorithm,
            "public_key": b64url_no_pad(key.public_key),
            "public_key_sha256": key.public_key_sha256,
            "is_default": key.is_default,
            "revoked_at": key.revoked_at,
        }
        for key in keys
    ]


@router.post("/me/keys")
async def add_key(
    payload: AddKeyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    try:
        key_type = KeyType(payload.key_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="key_type must be 'kem' or 'sig'") from exc
    key = UserKey(
        user_id=current_user.id,
        key_type=key_type,
        algorithm=payload.algorithm,
        public_key=b64url_decode_no_pad(payload.public_key),
        public_key_sha256="",
        is_default=payload.make_default,
    )
    import hashlib

    key.public_key_sha256 = hashlib.sha256(key.public_key).hexdigest()

    if payload.make_default:
        old_defaults = (
            await db.execute(
                select(UserKey).where(
                    UserKey.user_id == current_user.id,
                    UserKey.key_type == key_type,
                    UserKey.is_default.is_(True),
                )
            )
        ).scalars()
        for old in old_defaults:
            old.is_default = False

    db.add(key)
    await db.commit()
    await db.refresh(key)
    return {"id": key.id}


@router.delete("/me/keys/{key_id}")
async def revoke_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    key = (
        await db.execute(
            select(UserKey).where(UserKey.id == key_id, UserKey.user_id == current_user.id, UserKey.revoked_at.is_(None))
        )
    ).scalar_one_or_none()
    if key is None:
        raise HTTPException(status_code=404, detail="Key not found")
    key.revoked_at = datetime.now(timezone.utc)
    key.is_default = False
    await db.commit()
    return {"status": "revoked"}


@router.get("/{username}/public-keys")
async def public_keys(username: str, db: AsyncSession = Depends(get_db_session)) -> dict:
    user = (await db.execute(select(User).where(User.username == username, User.is_active.is_(True)))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Not found")

    keys = (
        await db.execute(
            select(UserKey).where(UserKey.user_id == user.id, UserKey.revoked_at.is_(None)).order_by(UserKey.created_at.desc())
        )
    ).scalars()
    return {
        "username": user.username,
        "keys": [
            {
                "id": key.id,
                "key_type": key.key_type.value,
                "algorithm": key.algorithm,
                "public_key": b64url_no_pad(key.public_key),
                "public_key_sha256": key.public_key_sha256,
                "is_default": key.is_default,
            }
            for key in keys
        ],
    }
