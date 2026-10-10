from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

import pytest

from app.core.canonical import b64url_no_pad, canonical_dumps


class DummySigner:
    def __init__(self, alg: str):
        self.alg = alg

    def verify(self, pk: bytes, msg: bytes, signature: bytes) -> bool:
        return signature == b"ok"


@pytest.mark.asyncio
async def test_register_login_upload_verify_delete_flow(client, monkeypatch):
    monkeypatch.setattr("app.services.auth_service.Signer", DummySigner)
    monkeypatch.setattr("app.services.file_service.Signer", DummySigner)

    fake_key = b64url_no_pad(b"pk")
    res = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "alice",
            "kem": {"algorithm": "ML-KEM-768", "public_key": fake_key},
            "sig": {"algorithm": "ML-DSA-65", "public_key": fake_key},
        },
    )
    assert res.status_code == 200
    user_id = res.json()["user_id"]

    c = await client.post("/api/v1/auth/challenge", json={"username": "alice"})
    assert c.status_code == 200
    challenge_id = c.json()["challenge_id"]

    v = await client.post(
        "/api/v1/auth/verify",
        json={"challenge_id": challenge_id, "signature": b64url_no_pad(b"ok")},
    )
    assert v.status_code == 200
    token = v.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    keys_resp = await client.get("/api/v1/users/me/keys", headers=headers)
    sig_key_id = [k["id"] for k in keys_resp.json() if k["key_type"] == "sig"][0]

    ciphertext = b"hello encrypted world"
    kem_ct = b"kem-ct"
    wrapped = b"wrapped-dek"
    metadata = {
        "version": 1,
        "file_id": "11111111-1111-4111-8111-111111111111",
        "owner_id": user_id,
        "original_filename": "report.pdf",
        "original_size": 20,
        "mime_type": "application/pdf",
        "sym_alg": "AES-256-GCM",
        "chunk_size": 4194304,
        "chunk_count": 1,
        "base_nonce": b64url_no_pad(b"12345678"),
        "kem_alg": "ML-KEM-768",
        "kem_ct_sha256": hashlib.sha256(kem_ct).hexdigest(),
        "wrapped_dek_sha256": hashlib.sha256(wrapped).hexdigest(),
        "sig_alg": "ML-DSA-65",
        "ciphertext_sha256": hashlib.sha256(ciphertext).hexdigest(),
        "ciphertext_size": len(ciphertext),
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }

    data = {
        "metadata": canonical_dumps(metadata),
        "kem_ciphertext": b64url_no_pad(kem_ct),
        "wrapped_dek": b64url_no_pad(wrapped),
        "signature": b64url_no_pad(b"ok"),
        "sig_key_id": sig_key_id,
    }
    files = {"ciphertext": ("cipher.bin", ciphertext, "application/octet-stream")}
    up = await client.post("/api/v1/files", data=data, files=files, headers=headers)
    assert up.status_code == 201

    lst = await client.get("/api/v1/files", headers=headers)
    assert lst.status_code == 200
    assert len(lst.json()) == 1

    md = await client.get(f"/api/v1/files/{metadata['file_id']}", headers=headers)
    assert md.status_code == 200

    vf = await client.post(f"/api/v1/files/{metadata['file_id']}/verify", headers=headers)
    assert vf.status_code == 200
    assert vf.json()["hash_ok"] is True

    dl = await client.get(f"/api/v1/files/{metadata['file_id']}/content", headers=headers)
    assert dl.status_code == 200
    assert dl.content == ciphertext

    rm = await client.delete(f"/api/v1/files/{metadata['file_id']}", headers=headers)
    assert rm.status_code == 200


@pytest.mark.asyncio
async def test_negative_hash_mismatch_rejected(client, monkeypatch):
    monkeypatch.setattr("app.services.auth_service.Signer", DummySigner)
    monkeypatch.setattr("app.services.file_service.Signer", DummySigner)

    fake_key = b64url_no_pad(b"pk")
    await client.post(
        "/api/v1/auth/register",
        json={
            "username": "bob",
            "kem": {"algorithm": "ML-KEM-768", "public_key": fake_key},
            "sig": {"algorithm": "ML-DSA-65", "public_key": fake_key},
        },
    )
    challenge_id = (await client.post("/api/v1/auth/challenge", json={"username": "bob"})).json()["challenge_id"]
    token = (
        await client.post(
            "/api/v1/auth/verify",
            json={"challenge_id": challenge_id, "signature": b64url_no_pad(b"ok")},
        )
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    keys_resp = await client.get("/api/v1/users/me/keys", headers=headers)
    sig_key_id = [k["id"] for k in keys_resp.json() if k["key_type"] == "sig"][0]
    me = (await client.get("/api/v1/users/me", headers=headers)).json()

    ciphertext = b"data"
    kem_ct = b"kem-ct"
    wrapped = b"wrapped"
    metadata = {
        "version": 1,
        "file_id": "22222222-2222-4222-8222-222222222222",
        "owner_id": me["id"],
        "original_filename": "a.bin",
        "original_size": 4,
        "mime_type": "application/octet-stream",
        "sym_alg": "AES-256-GCM",
        "chunk_size": 4194304,
        "chunk_count": 1,
        "base_nonce": b64url_no_pad(b"12345678"),
        "kem_alg": "ML-KEM-768",
        "kem_ct_sha256": hashlib.sha256(kem_ct).hexdigest(),
        "wrapped_dek_sha256": hashlib.sha256(wrapped).hexdigest(),
        "sig_alg": "ML-DSA-65",
        "ciphertext_sha256": hashlib.sha256(b"different").hexdigest(),
        "ciphertext_size": len(ciphertext),
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }

    up = await client.post(
        "/api/v1/files",
        data={
            "metadata": canonical_dumps(metadata),
            "kem_ciphertext": b64url_no_pad(kem_ct),
            "wrapped_dek": b64url_no_pad(wrapped),
            "signature": b64url_no_pad(b"ok"),
            "sig_key_id": sig_key_id,
        },
        files={"ciphertext": ("a.bin", ciphertext, "application/octet-stream")},
        headers=headers,
    )
    assert up.status_code == 400
