from __future__ import annotations

import base64
import hashlib
import json
from typing import Any


def b64url_no_pad(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def b64url_decode_no_pad(value: str) -> bytes:
    pad_len = (4 - len(value) % 4) % 4
    return base64.urlsafe_b64decode(value + ("=" * pad_len))


def canonical_dumps(data: dict[str, Any]) -> str:
    return json.dumps(data, separators=(",", ":"), sort_keys=True, ensure_ascii=True)


def canonical_bytes(data: dict[str, Any]) -> bytes:
    return canonical_dumps(data).encode("utf-8")


def canonical_hash_hex(data: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_bytes(data)).hexdigest()
