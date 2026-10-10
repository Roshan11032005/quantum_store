from __future__ import annotations

from app.storage.s3_backend import S3StorageBackend


class MinIOStorageBackend(S3StorageBackend):
    """MinIO is S3-compatible, so we reuse the S3 implementation."""
