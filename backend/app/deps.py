from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import TokenError, decode_access_token
from app.db.models import User
from app.db.session import get_db_session
from app.storage.base import StorageBackend
from app.storage.local import LocalStorageBackend
from app.storage.minio_backend import MinIOStorageBackend
from app.storage.s3_backend import S3StorageBackend


def get_settings_dep():
    return get_settings()


def get_storage_backend() -> StorageBackend:
    settings = get_settings()
    if settings.storage_backend == "minio":
        return MinIOStorageBackend()
    if settings.storage_backend == "s3":
        return S3StorageBackend()
    return LocalStorageBackend()


async def get_current_user(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    db: AsyncSession = Depends(get_db_session),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise TokenError("Missing bearer token")

    token = authorization.replace("Bearer ", "", 1)
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    user = (await db.execute(select(User).where(User.id == user_id, User.is_active.is_(True)))).scalar_one_or_none()
    if user is None:
        raise TokenError("Invalid token subject")
    return user
