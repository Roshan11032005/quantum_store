from __future__ import annotations

from pydantic import BaseModel, Field


class PublicKeyPayload(BaseModel):
    algorithm: str
    public_key: str  # base64url no padding


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=128)
    kem: PublicKeyPayload
    sig: PublicKeyPayload


class RegisterResponse(BaseModel):
    user_id: str
    username: str
    kem_fingerprint: str
    sig_fingerprint: str


class ChallengeRequest(BaseModel):
    username: str


class ChallengeResponse(BaseModel):
    challenge_id: str
    nonce: str
    expires_in: int


class VerifyRequest(BaseModel):
    challenge_id: str
    signature: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
