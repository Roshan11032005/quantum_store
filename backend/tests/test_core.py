from __future__ import annotations

from app.core.canonical import canonical_dumps
from app.core.chunks import build_chunk_aad, build_chunk_nonce
from app.core.kdf import derive_kek


def test_canonical_determinism() -> None:
    payload = {"b": 2, "a": 1, "z": "x"}
    assert canonical_dumps(payload) == '{"a":1,"b":2,"z":"x"}'


def test_hkdf_kek_deterministic() -> None:
    ss = b"\x01" * 32
    file_id = "00000000-0000-0000-0000-000000000001"
    k1 = derive_kek(ss, file_id)
    k2 = derive_kek(ss, file_id)
    assert k1 == k2
    assert len(k1) == 32


def test_chunk_nonce_and_aad() -> None:
    nonce = build_chunk_nonce(b"12345678", 5)
    assert len(nonce) == 12
    assert nonce.endswith((5).to_bytes(4, "big"))

    aad = build_chunk_aad("file-1", 2, 7, True)
    assert aad.endswith(b"\x01")
    assert b"file-1" in aad
