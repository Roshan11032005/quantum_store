from __future__ import annotations

import asyncio
import hashlib
import io
from typing import AsyncIterator

import boto3

from app.config import get_settings
from app.storage.base import PutResult, StorageBackend


class S3StorageBackend(StorageBackend):
    def __init__(self) -> None:
        settings = get_settings()
        self.bucket = settings.s3_bucket or settings.minio_bucket
        endpoint = settings.minio_endpoint if settings.storage_backend == "minio" else None
        self.client = boto3.client(
            "s3",
            region_name=settings.s3_region or None,
            endpoint_url=f"http://{endpoint}" if endpoint else None,
            aws_access_key_id=settings.minio_access_key if endpoint else None,
            aws_secret_access_key=settings.minio_secret_key if endpoint else None,
        )

    async def put(self, key: str, stream: AsyncIterator[bytes]) -> PutResult:
        digest = hashlib.sha256()
        size = 0
        data = bytearray()
        async for chunk in stream:
            digest.update(chunk)
            data.extend(chunk)
            size += len(chunk)

        await asyncio.to_thread(
            self.client.upload_fileobj,
            io.BytesIO(data),
            self.bucket,
            key,
        )
        return PutResult(size=size, sha256=digest.hexdigest())

    async def get(self, key: str, start: int | None = None, end: int | None = None) -> AsyncIterator[bytes]:
        range_header = None
        if start is not None:
            if end is not None:
                range_header = f"bytes={start}-{end}"
            else:
                range_header = f"bytes={start}-"

        def read_sync() -> bytes:
            params = {"Bucket": self.bucket, "Key": key}
            if range_header:
                params["Range"] = range_header
            body = self.client.get_object(**params)["Body"]
            return body.read()

        data = await asyncio.to_thread(read_sync)
        yield data

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)

    async def exists(self, key: str) -> bool:
        def check_sync() -> bool:
            try:
                self.client.head_object(Bucket=self.bucket, Key=key)
                return True
            except Exception:
                return False

        return await asyncio.to_thread(check_sync)
