from __future__ import annotations

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def derive_kek(shared_secret: bytes, file_id: str, length: int = 32) -> bytes:
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=length,
        salt=file_id.encode("utf-8"),
        info=b"pqc-storage-kek-v1",
    )
    return hkdf.derive(shared_secret)
