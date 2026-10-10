from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.session import get_db_session
from app.schemas.auth import (
    ChallengeRequest,
    ChallengeResponse,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
    VerifyRequest,
)
from app.services.auth_service import issue_challenge, register_user, serialize_challenge, verify_challenge

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db_session)) -> RegisterResponse:
    try:
        user, kem_fp, sig_fp = await register_user(
            db,
            username=payload.username,
            kem_algorithm=payload.kem.algorithm,
            kem_public_key_b64=payload.kem.public_key,
            sig_algorithm=payload.sig.algorithm,
            sig_public_key_b64=payload.sig.public_key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return RegisterResponse(
        user_id=user.id,
        username=user.username,
        kem_fingerprint=kem_fp,
        sig_fingerprint=sig_fp,
    )


@router.post("/challenge", response_model=ChallengeResponse)
async def challenge(payload: ChallengeRequest, db: AsyncSession = Depends(get_db_session)) -> ChallengeResponse:
    challenge_obj = await issue_challenge(db, payload.username)
    expires_in = get_settings().auth_challenge_ttl_seconds
    return ChallengeResponse(**serialize_challenge(challenge_obj, expires_in))


@router.post("/verify", response_model=TokenResponse)
async def verify(payload: VerifyRequest, db: AsyncSession = Depends(get_db_session)) -> TokenResponse:
    try:
        token, expires_in = await verify_challenge(db, payload.challenge_id, payload.signature)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.post("/logout")
async def logout() -> dict[str, str]:
    return {"status": "ok"}
