from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.canonical import (
    b64url_decode_no_pad,
    b64url_no_pad,
    canonical_bytes,
    canonical_dumps,
)
from app.core.pqc import Signer
from app.core.security import now_utc
from app.db.models import AuditLog, FileRecord, KeyType, User, UserKey
from app.storage.base import StorageBackend


class UploadValidationError(ValueError):
    pass


def _build_storage_key(owner_id: str, file_id: str) -> str:
    return f"{owner_id[:2]}/{owner_id}/{file_id}.bin"


def _signature_message(metadata_obj: dict) -> bytes:
    digest = hashlib.sha256(canonical_bytes(metadata_obj)).digest()
    return digest


def _validate_metadata(metadata_obj: dict, owner_id: str) -> None:
    settings = get_settings()
    if metadata_obj.get("version") != 1:
        raise UploadValidationError("Unsupported metadata version")

    file_id = metadata_obj.get("file_id")
    if not file_id:
        raise UploadValidationError("Missing file_id")
    try:
        uuid.UUID(file_id)
    except Exception as exc:
        raise UploadValidationError("Invalid file_id") from exc

    if metadata_obj.get("owner_id") != owner_id:
        raise UploadValidationError("owner_id mismatch")

    created_raw = metadata_obj.get("created_at")
    if not isinstance(created_raw, str):
        raise UploadValidationError("Missing created_at")

    created_at = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
    if abs((created_at - now_utc()).total_seconds()) > 600:
        raise UploadValidationError("created_at timestamp is outside allowed skew")

    if metadata_obj.get("sym_alg") != "AES-256-GCM":
        raise UploadValidationError("Unsupported sym_alg")

    if metadata_obj.get("kem_alg") not in settings.allowed_kems_list:
        raise UploadValidationError("Unsupported kem_alg")

    if metadata_obj.get("sig_alg") not in settings.allowed_sigs_list:
        raise UploadValidationError("Unsupported sig_alg")


async def create_file_record(
    db: AsyncSession,
    storage: StorageBackend,
    owner: User,
    metadata_json: str,
    kem_ciphertext_b64: str,
    wrapped_dek_b64: str,
    signature_b64: str,
    sig_key_id: str,
    ciphertext_stream,
) -> FileRecord:
    metadata_obj = json.loads(metadata_json)
    canonical = canonical_dumps(metadata_obj)
    if canonical != metadata_json:
        raise UploadValidationError("metadata must be canonical JSON exactly as signed")

    _validate_metadata(metadata_obj, owner.id)

    existing = (await db.execute(select(FileRecord).where(FileRecord.id == metadata_obj["file_id"]))).scalar_one_or_none()
    if existing is not None:
        raise UploadValidationError("file_id already exists")

    sig_key = (
        await db.execute(
            select(UserKey).where(
                UserKey.id == sig_key_id,
                UserKey.user_id == owner.id,
                UserKey.key_type == KeyType.sig,
                UserKey.revoked_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if sig_key is None:
        raise UploadValidationError("Invalid sig_key_id")

    storage_key = _build_storage_key(owner.id, metadata_obj["file_id"])

    async def stream_ciphertext():
        async for chunk in ciphertext_stream:
            yield chunk

    put_result = await storage.put(storage_key, stream_ciphertext())
    if put_result.sha256 != metadata_obj.get("ciphertext_sha256"):
        await storage.delete(storage_key)
        raise UploadValidationError("ciphertext hash mismatch")

    kem_ciphertext = b64url_decode_no_pad(kem_ciphertext_b64)
    wrapped_dek = b64url_decode_no_pad(wrapped_dek_b64)
    signature = b64url_decode_no_pad(signature_b64)

    kem_hash = hashlib.sha256(kem_ciphertext).hexdigest()
    wrapped_hash = hashlib.sha256(wrapped_dek).hexdigest()
    if kem_hash != metadata_obj.get("kem_ct_sha256"):
        await storage.delete(storage_key)
        raise UploadValidationError("kem_ct_sha256 mismatch")
    if wrapped_hash != metadata_obj.get("wrapped_dek_sha256"):
        await storage.delete(storage_key)
        raise UploadValidationError("wrapped_dek_sha256 mismatch")

    signer = Signer(sig_key.algorithm)
    if not signer.verify(sig_key.public_key, _signature_message(metadata_obj), signature):
        await storage.delete(storage_key)
        raise UploadValidationError("signature verification failed")

    if put_result.size > get_settings().max_upload_bytes:
        await storage.delete(storage_key)
        raise UploadValidationError("upload exceeds max size")

    record = FileRecord(
        id=metadata_obj["file_id"],
        owner_id=owner.id,
        storage_key=storage_key,
        metadata_json=metadata_json,
        kem_ciphertext=kem_ciphertext,
        wrapped_dek=wrapped_dek,
        signature=signature,
        sig_key_id=sig_key.id,
        ciphertext_size=put_result.size,
        ciphertext_sha256=put_result.sha256,
    )
    db.add(record)
    db.add(AuditLog(user_id=owner.id, action="upload", file_id=record.id, detail={"storage_key": storage_key}))
    await db.commit()
    await db.refresh(record)
    return record


async def list_files(db: AsyncSession, owner: User) -> list[FileRecord]:
    rows = await db.execute(
        select(FileRecord).where(FileRecord.owner_id == owner.id, FileRecord.deleted_at.is_(None)).order_by(FileRecord.created_at.desc())
    )
    return list(rows.scalars().all())


async def get_file(db: AsyncSession, owner: User, file_id: str) -> FileRecord | None:
    row = (
        await db.execute(
            select(FileRecord).where(
                FileRecord.id == file_id,
                FileRecord.owner_id == owner.id,
                FileRecord.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    return row


async def soft_delete_file(db: AsyncSession, storage: StorageBackend, owner: User, file_id: str) -> bool:
    record = await get_file(db, owner, file_id)
    if record is None:
        return False
    record.deleted_at = now_utc()
    await storage.delete(record.storage_key)
    db.add(AuditLog(user_id=owner.id, action="delete", file_id=file_id, detail={}))
    await db.commit()
    return True


async def reverify_file(db: AsyncSession, storage: StorageBackend, owner: User, file_id: str) -> tuple[bool, bool]:
    record = await get_file(db, owner, file_id)
    if record is None:
        return False, False

    digest = hashlib.sha256()
    async for chunk in storage.get(record.storage_key):
        digest.update(chunk)
    hash_ok = digest.hexdigest() == record.ciphertext_sha256

    metadata_obj = json.loads(record.metadata_json)
    sig_key = (await db.execute(select(UserKey).where(UserKey.id == record.sig_key_id))).scalar_one_or_none()
    signature_ok = False
    if sig_key is not None:
        signer = Signer(sig_key.algorithm)
        signature_ok = signer.verify(sig_key.public_key, _signature_message(metadata_obj), record.signature)

    db.add(
        AuditLog(
            user_id=owner.id,
            action="verify",
            file_id=file_id,
            detail={"hash_ok": hash_ok, "signature_ok": signature_ok},
        )
    )
    await db.commit()
    return hash_ok, signature_ok


def serialize_file_detail(record: FileRecord) -> dict:
    return {
        "file_id": record.id,
        "metadata": json.loads(record.metadata_json),
        "kem_ciphertext": b64url_no_pad(record.kem_ciphertext),
        "wrapped_dek": b64url_no_pad(record.wrapped_dek),
        "signature": b64url_no_pad(record.signature),
    }
