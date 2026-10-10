from __future__ import annotations

import asyncio
import hashlib
import os
from pathlib import Path
from typing import AsyncIterator

from app.config import get_settings
from app.storage.base import PutResult, StorageBackend


class LocalStorageBackend(StorageBackend):
    def __init__(self, root: str | None = None) -> None:
        settings = get_settings()
        self.root = Path(root or settings.storage_root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        return self.root / key

    async def put(self, key: str, stream: AsyncIterator[bytes]) -> PutResult:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")

        size = 0
        digest = hashlib.sha256()

        with tmp.open("wb") as fh:
            async for chunk in stream:
                digest.update(chunk)
                size += len(chunk)
                fh.write(chunk)

        await asyncio.to_thread(os.replace, tmp, path)
        return PutResult(size=size, sha256=digest.hexdigest())

    async def get(self, key: str, start: int | None = None, end: int | None = None) -> AsyncIterator[bytes]:
        path = self._path(key)

        def read_chunks() -> list[bytes]:
            chunks: list[bytes] = []
            with path.open("rb") as fh:
                if start is not None:
                    fh.seek(start)
                remaining = None if end is None or start is None else (end - start + 1)
                while True:
                    part = fh.read(64 * 1024 if remaining is None else min(64 * 1024, remaining))
                    if not part:
                        break
                    chunks.append(part)
                    if remaining is not None:
                        remaining -= len(part)
                        if remaining <= 0:
                            break
            return chunks

        for chunk in await asyncio.to_thread(read_chunks):
            yield chunk

    async def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            await asyncio.to_thread(path.unlink)

    async def exists(self, key: str) -> bool:
        return self._path(key).exists()
