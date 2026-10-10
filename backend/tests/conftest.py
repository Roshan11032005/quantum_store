from __future__ import annotations

import os
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test.db"
os.environ["STORAGE_BACKEND"] = "local"
os.environ["STORAGE_ROOT"] = "./test-data"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["MAX_UPLOAD_BYTES"] = "10485760"

from app.db.base import Base
from app.db.session import engine
from app.main import create_app


@pytest.fixture(autouse=True)
async def reset_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture(autouse=True)
def cleanup_fs() -> None:
    for p in [Path("test.db"), Path("test-data")]:
        if p.exists() and p.is_file():
            p.unlink()
        if p.exists() and p.is_dir():
            import shutil

            shutil.rmtree(p)
    yield
    for p in [Path("test.db"), Path("test-data")]:
        if p.exists() and p.is_file():
            p.unlink()
        if p.exists() and p.is_dir():
            import shutil

            shutil.rmtree(p)


@pytest.fixture
async def client() -> AsyncClient:
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c
