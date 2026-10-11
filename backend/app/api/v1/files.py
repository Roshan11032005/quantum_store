from __future__ import annotations

from datetime import datetime, timezone
from typing import AsyncIterator

from fastapi import APIRouter, Depends, File, Form, HTTPException, Header, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.canonical import b64url_no_pad
from app.db.models import User
from app.db.session import get_db_session
from app.deps import get_current_user, get_storage_backend
from app.schemas.files import FileDetail, FileSummary, FileUploadResponse, VerifyResponse
from app.services.file_service import (
    UploadValidationError,
    create_file_record,
    get_file,
    list_files,
    reverify_file,
    serialize_file_detail,
    soft_delete_file,
)
from app.storage.base import StorageBackend

router = APIRouter(prefix="/files", tags=["files"])


@router.post("", response_model=FileUploadResponse, status_code=201)
async def upload_file(
    metadata: str = Form(...),
    kem_ciphertext: str = Form(...),
    wrapped_dek: str = Form(...),
    signature: str = Form(...),
    sig_key_id: str = Form(...),
    ciphertext: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    storage: StorageBackend = Depends(get_storage_backend),
) -> FileUploadResponse:
    async def upload_stream() -> AsyncIterator[bytes]:
        while True:
            chunk = await ciphertext.read(1024 * 1024)
            if not chunk:
                break
            yield chunk

    try:
        record = await create_file_record(
            db,
            storage,
            current_user,
            metadata,
            kem_ciphertext,
            wrapped_dek,
            signature,
            sig_key_id,
            upload_stream(),
        )
    except UploadValidationError as exc:
        detail = str(exc)
        if "max size" in detail:
            raise HTTPException(status_code=413, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc

    return FileUploadResponse(file_id=record.id, owner_id=record.owner_id, created_at=record.created_at)


@router.get("", response_model=list[FileSummary])
async def list_my_files(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[FileSummary]:
    rows = await list_files(db, current_user)
    import json

    return [
        FileSummary(
            file_id=row.id,
            owner_id=row.owner_id,
            ciphertext_size=row.ciphertext_size,
            created_at=row.created_at,
            metadata=json.loads(row.metadata_json),
        )
        for row in rows
    ]


@router.get("/{file_id}", response_model=FileDetail)
async def get_file_metadata(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> FileDetail:
    row = await get_file(db, current_user, file_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    return FileDetail(**serialize_file_detail(row))


@router.get("/{file_id}/content")
async def get_file_content(
    file_id: str,
    range_header: str | None = Header(default=None, alias="Range"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    storage: StorageBackend = Depends(get_storage_backend),
) -> StreamingResponse:
    row = await get_file(db, current_user, file_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")

    start = None
    end = None
    status_code = 200
    headers: dict[str, str] = {}

    if range_header and range_header.startswith("bytes="):
        try:
            spec = range_header.replace("bytes=", "", 1)
            start_s, end_s = spec.split("-", 1)
            start = int(start_s) if start_s else None
            end = int(end_s) if end_s else None
            status_code = 206
            headers["Accept-Ranges"] = "bytes"
        except Exception as exc:
            raise HTTPException(status_code=416, detail="Invalid Range header") from exc

    async def body():
        async for chunk in storage.get(row.storage_key, start=start, end=end):
            yield chunk

    # Check the object exists before starting the streaming response.
    # A missing object after the DB record exists means the storage backend
    # changed (e.g. MinIO → local) or the file was deleted externally.
    if not await storage.exists(row.storage_key):
        raise HTTPException(status_code=404, detail="File content not found. The file may need to be re-uploaded.")

    return StreamingResponse(
        body(),
        media_type="application/octet-stream",
        status_code=status_code,
        headers=headers,
    )


@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    storage: StorageBackend = Depends(get_storage_backend),
) -> dict:
    ok = await soft_delete_file(db, storage, current_user, file_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"status": "deleted"}


@router.post("/{file_id}/verify", response_model=VerifyResponse)
async def verify_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    storage: StorageBackend = Depends(get_storage_backend),
) -> VerifyResponse:
    row = await get_file(db, current_user, file_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")

    hash_ok, signature_ok = await reverify_file(db, storage, current_user, file_id)
    return VerifyResponse(hash_ok=hash_ok, signature_ok=signature_ok, checked_at=datetime.now(timezone.utc))


@router.post("/{file_id}/share")
async def share_file(file_id: str) -> dict:
    return {"status": "not_implemented", "file_id": file_id}


@router.get("/{file_id}/shares")
async def file_shares(file_id: str) -> dict:
    return {"shares": [], "file_id": file_id}
