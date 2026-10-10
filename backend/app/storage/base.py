from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator


@dataclass(slots=True)
class PutResult:
    size: int
    sha256: str


class StorageBackend(ABC):
    @abstractmethod
    async def put(self, key: str, stream: AsyncIterator[bytes]) -> PutResult:
        raise NotImplementedError

    @abstractmethod
    async def get(self, key: str, start: int | None = None, end: int | None = None) -> AsyncIterator[bytes]:
        raise NotImplementedError

    @abstractmethod
    async def delete(self, key: str) -> None:
        raise NotImplementedError

    @abstractmethod
    async def exists(self, key: str) -> bool:
        raise NotImplementedError
