from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class FileUploadResponse(BaseModel):
    file_id: str
    owner_id: str
    created_at: datetime


class FileSummary(BaseModel):
    file_id: str
    owner_id: str
    ciphertext_size: int
    created_at: datetime
    metadata: dict[str, Any]


class FileDetail(BaseModel):
    file_id: str
    metadata: dict[str, Any]
    kem_ciphertext: str
    wrapped_dek: str
    signature: str


class VerifyResponse(BaseModel):
    hash_ok: bool
    signature_ok: bool
    checked_at: datetime
