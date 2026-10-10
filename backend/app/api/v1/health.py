from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pqc import discover_algorithms
from app.db.session import get_db_session
from app.deps import get_storage_backend
from app.storage.base import StorageBackend

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/ready")
async def ready(
    db: AsyncSession = Depends(get_db_session),
    storage: StorageBackend = Depends(get_storage_backend),
) -> dict:
    await db.execute(text("SELECT 1"))
    algos = discover_algorithms()
    return {
        "status": "ready",
        "db": "ok",
        "storage": type(storage).__name__,
        "liboqs_loaded": bool(algos["kem"] or algos["sig"]),
    }
