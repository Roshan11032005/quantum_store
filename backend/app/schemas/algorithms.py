from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class AlgorithmEntry(BaseModel):
    name: str
    liboqs_name: str
    type: str  # "kem" or "sig"
    nist_level: int
    public_key_size: int
    secret_key_size: int
    ciphertext_size: int | None = None   # KEM only
    signature_size: int | None = None    # SIG only
    standard: str
    status: str
    details: dict[str, Any]


class AlgorithmResponse(BaseModel):
    kems: list[AlgorithmEntry]
    sigs: list[AlgorithmEntry]
