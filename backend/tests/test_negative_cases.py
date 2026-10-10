from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.canonical import b64url_no_pad, canonical_dumps
from app.db.models import AuthChallenge
from app.db.session import SessionLocal


class DummySigner:
    def __init__(self, alg: str):
        self.alg = alg

    def verify(self, pk: bytes, msg: bytes, signature: bytes) -> bool:
        return signature == b"ok"


@pytest.mark.asyncio
async def test_replayed_challenge_rejected(client, monkeypatch):
    monkeypatch.setattr("app.services.auth_service.Signer", DummySigner)

    fake_key = b64url_no_pad(b"pk")
    await client.post(
        "/api/v1/auth/register",
        json={
            "username": "carol",
            "kem": {"algorithm": "ML-KEM-768", "public_key": fake_key},
            "sig": {"algorithm": "ML-DSA-65", "public_key": fake_key},
        },
    )
    challenge_id = (await client.post("/api/v1/auth/challenge", json={"username": "carol"})).json()["challenge_id"]

    ok = await client.post(
        "/api/v1/auth/verify",
        json={"challenge_id": challenge_id, "signature": b64url_no_pad(b"ok")},
    )
    assert ok.status_code == 200

    replay = await client.post(
        "/api/v1/auth/verify",
        json={"challenge_id": challenge_id, "signature": b64url_no_pad(b"ok")},
    )
    assert replay.status_code == 401


@pytest.mark.asyncio
async def test_expired_challenge_rejected(client, monkeypatch):
    monkeypatch.setattr("app.services.auth_service.Signer", DummySigner)

    fake_key = b64url_no_pad(b"pk")
    await client.post(
        "/api/v1/auth/register",
        json={
            "username": "dave",
            "kem": {"algorithm": "ML-KEM-768", "public_key": fake_key},
            "sig": {"algorithm": "ML-DSA-65", "public_key": fake_key},
        },
    )
    challenge_id = (await client.post("/api/v1/auth/challenge", json={"username": "dave"})).json()["challenge_id"]

    async with SessionLocal() as db:
        challenge = (
            await db.execute(select(AuthChallenge).where(AuthChallenge.id == challenge_id))
        ).scalar_one()
        challenge.expires_at = datetime.now(timezone.utc) - timedelta(seconds=5)
        await db.commit()

    expired = await client.post(
        "/api/v1/auth/verify",
        json={"challenge_id": challenge_id, "signature": b64url_no_pad(b"ok")},
    )
    assert expired.status_code == 401


@pytest.mark.asyncio
async def test_algorithm_downgrade_and_tamper_at_rest(client, monkeypatch):
    monkeypatch.setattr("app.services.auth_service.Signer", DummySigner)
    monkeypatch.setattr("app.services.file_service.Signer", DummySigner)

    fake_key = b64url_no_pad(b"pk")
    await client.post(
        "/api/v1/auth/register",
        json={
            "username": "erin",
            "kem": {"algorithm": "ML-KEM-768", "public_key": fake_key},
            "sig": {"algorithm": "ML-DSA-65", "public_key": fake_key},
        },
    )
    challenge_id = (await client.post("/api/v1/auth/challenge", json={"username": "erin"})).json()["challenge_id"]
    token = (
        await client.post(
            "/api/v1/auth/verify",
            json={"challenge_id": challenge_id, "signature": b64url_no_pad(b"ok")},
        )
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = (await client.get("/api/v1/users/me", headers=headers)).json()
    keys = (await client.get("/api/v1/users/me/keys", headers=headers)).json()
    sig_key_id = [k["id"] for k in keys if k["key_type"] == "sig"][0]

    ciphertext = b"ciphertext"
    kem_ct = b"k"
    wrapped = b"w"

    bad_alg = {
        "version": 1,
        "file_id": "33333333-3333-4333-8333-333333333333",
        "owner_id": me["id"],
        "original_filename": "a.bin",
        "original_size": 10,
        "mime_type": "application/octet-stream",
        "sym_alg": "AES-256-GCM",
        "chunk_size": 4194304,
        "chunk_count": 1,
        "base_nonce": b64url_no_pad(b"12345678"),
        "kem_alg": "BAD-KEM",
        "kem_ct_sha256": hashlib.sha256(kem_ct).hexdigest(),
        "wrapped_dek_sha256": hashlib.sha256(wrapped).hexdigest(),
        "sig_alg": "ML-DSA-65",
        "ciphertext_sha256": hashlib.sha256(ciphertext).hexdigest(),
        "ciphertext_size": len(ciphertext),
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }

    rejected = await client.post(
        "/api/v1/files",
        data={
            "metadata": canonical_dumps(bad_alg),
            "kem_ciphertext": b64url_no_pad(kem_ct),
            "wrapped_dek": b64url_no_pad(wrapped),
            "signature": b64url_no_pad(b"ok"),
            "sig_key_id": sig_key_id,
        },
        files={"ciphertext": ("a.bin", ciphertext, "application/octet-stream")},
        headers=headers,
    )
    assert rejected.status_code == 400

    file_id = "44444444-4444-4444-8444-444444444444"
    metadata = {
        "version": 1,
        "file_id": file_id,
        "owner_id": me["id"],
        "original_filename": "b.bin",
        "original_size": 10,
        "mime_type": "application/octet-stream",
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

    ok = await client.post(
        "/api/v1/files",
        data={
            "metadata": canonical_dumps(metadata),
            "kem_ciphertext": b64url_no_pad(kem_ct),
            "wrapped_dek": b64url_no_pad(wrapped),
            "signature": b64url_no_pad(b"ok"),
            "sig_key_id": sig_key_id,
        },
        files={"ciphertext": ("b.bin", ciphertext, "application/octet-stream")},
        headers=headers,
    )
    assert ok.status_code == 201

    # Tamper the stored blob directly and ensure server-side verification detects it.
    import pathlib

    blob = pathlib.Path("test-data") / me["id"][:2] / me["id"] / f"{file_id}.bin"
    blob.write_bytes(b"tampered")

    verify = await client.post(f"/api/v1/files/{file_id}/verify", headers=headers)
    assert verify.status_code == 200
    assert verify.json()["hash_ok"] is False


@pytest.mark.asyncio
async def test_other_user_file_is_404(client, monkeypatch):
    monkeypatch.setattr("app.services.auth_service.Signer", DummySigner)
    monkeypatch.setattr("app.services.file_service.Signer", DummySigner)

    fake_key = b64url_no_pad(b"pk")

    async def login(username: str) -> tuple[str, str, str]:
        await client.post(
            "/api/v1/auth/register",
            json={
                "username": username,
                "kem": {"algorithm": "ML-KEM-768", "public_key": fake_key},
                "sig": {"algorithm": "ML-DSA-65", "public_key": fake_key},
            },
        )
        challenge_id = (await client.post("/api/v1/auth/challenge", json={"username": username})).json()["challenge_id"]
        token = (
            await client.post(
                "/api/v1/auth/verify",
                json={"challenge_id": challenge_id, "signature": b64url_no_pad(b"ok")},
            )
        ).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        me = (await client.get("/api/v1/users/me", headers=headers)).json()
        keys = (await client.get("/api/v1/users/me/keys", headers=headers)).json()
        sig_key_id = [k["id"] for k in keys if k["key_type"] == "sig"][0]
        return token, me["id"], sig_key_id

    token_a, user_a, sig_key_id = await login("frank")
    token_b, _, _ = await login("grace")

    ciphertext = b"shared?"
    kem_ct = b"k"
    wrapped = b"w"
    file_id = "55555555-5555-4555-8555-555555555555"
    metadata = {
        "version": 1,
        "file_id": file_id,
        "owner_id": user_a,
        "original_filename": "x.bin",
        "original_size": len(ciphertext),
        "mime_type": "application/octet-stream",
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

    await client.post(
        "/api/v1/files",
        data={
            "metadata": canonical_dumps(metadata),
            "kem_ciphertext": b64url_no_pad(kem_ct),
            "wrapped_dek": b64url_no_pad(wrapped),
            "signature": b64url_no_pad(b"ok"),
            "sig_key_id": sig_key_id,
        },
        files={"ciphertext": ("x.bin", ciphertext, "application/octet-stream")},
        headers={"Authorization": f"Bearer {token_a}"},
    )

    denied = await client.get(
        f"/api/v1/files/{file_id}", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert denied.status_code == 404


@pytest.mark.asyncio
async def test_oversize_upload_returns_413(client, monkeypatch):
    monkeypatch.setattr("app.services.auth_service.Signer", DummySigner)
    monkeypatch.setattr("app.services.file_service.Signer", DummySigner)

    fake_key = b64url_no_pad(b"pk")
    await client.post(
        "/api/v1/auth/register",
        json={
            "username": "henry",
            "kem": {"algorithm": "ML-KEM-768", "public_key": fake_key},
            "sig": {"algorithm": "ML-DSA-65", "public_key": fake_key},
        },
    )
    challenge_id = (await client.post("/api/v1/auth/challenge", json={"username": "henry"})).json()["challenge_id"]
    token = (
        await client.post(
            "/api/v1/auth/verify",
            json={"challenge_id": challenge_id, "signature": b64url_no_pad(b"ok")},
        )
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    me = (await client.get("/api/v1/users/me", headers=headers)).json()
    keys = (await client.get("/api/v1/users/me/keys", headers=headers)).json()
    sig_key_id = [k["id"] for k in keys if k["key_type"] == "sig"][0]

    kem_ct = b"k"
    wrapped = b"w"
    ciphertext = b"x" * (11 * 1024 * 1024)
    metadata = {
        "version": 1,
        "file_id": "66666666-6666-4666-8666-666666666666",
        "owner_id": me["id"],
        "original_filename": "large.bin",
        "original_size": len(ciphertext),
        "mime_type": "application/octet-stream",
        "sym_alg": "AES-256-GCM",
        "chunk_size": 4194304,
        "chunk_count": 3,
        "base_nonce": b64url_no_pad(b"12345678"),
        "kem_alg": "ML-KEM-768",
        "kem_ct_sha256": hashlib.sha256(kem_ct).hexdigest(),
        "wrapped_dek_sha256": hashlib.sha256(wrapped).hexdigest(),
        "sig_alg": "ML-DSA-65",
        "ciphertext_sha256": hashlib.sha256(ciphertext).hexdigest(),
        "ciphertext_size": len(ciphertext),
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }

    res = await client.post(
        "/api/v1/files",
        data={
            "metadata": canonical_dumps(metadata),
            "kem_ciphertext": b64url_no_pad(kem_ct),
            "wrapped_dek": b64url_no_pad(wrapped),
            "signature": b64url_no_pad(b"ok"),
            "sig_key_id": sig_key_id,
        },
        files={"ciphertext": ("large.bin", ciphertext, "application/octet-stream")},
        headers=headers,
    )
    assert res.status_code == 413
