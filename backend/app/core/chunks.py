from __future__ import annotations


def build_chunk_nonce(base_nonce: bytes, index: int) -> bytes:
    if len(base_nonce) != 8:
        raise ValueError("base_nonce must be exactly 8 bytes")
    return base_nonce + index.to_bytes(4, "big", signed=False)


def build_chunk_aad(file_id: str, index: int, chunk_count: int, final_flag: bool) -> bytes:
    return (
        file_id.encode("utf-8")
        + index.to_bytes(4, "big", signed=False)
        + chunk_count.to_bytes(4, "big", signed=False)
        + (b"\x01" if final_flag else b"\x00")
    )
