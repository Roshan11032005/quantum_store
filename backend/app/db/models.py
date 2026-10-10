from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class KeyType(str, enum.Enum):
    kem = "kem"
    sig = "sig"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class UserKey(Base):
    __tablename__ = "user_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    key_type: Mapped[KeyType] = mapped_column(Enum(KeyType), nullable=False)
    algorithm: Mapped[str] = mapped_column(String(128), nullable=False)
    public_key: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    public_key_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class FileRecord(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    metadata_json: Mapped[str] = mapped_column(Text, nullable=False)
    kem_ciphertext: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    wrapped_dek: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    signature: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    sig_key_id: Mapped[str] = mapped_column(ForeignKey("user_keys.id"), nullable=False)
    ciphertext_size: Mapped[int] = mapped_column(Integer, nullable=False)
    ciphertext_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuthChallenge(Base):
    __tablename__ = "auth_challenges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    username_hint: Mapped[str] = mapped_column(String(128), nullable=False)
    nonce: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class BenchmarkRun(Base):
    __tablename__ = "benchmark_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    environment: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    params: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    results: Mapped[list["BenchmarkResult"]] = relationship(back_populates="run", cascade="all,delete")


class BenchmarkResult(Base):
    __tablename__ = "benchmark_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id: Mapped[str] = mapped_column(ForeignKey("benchmark_runs.id"), nullable=False, index=True)
    operation: Mapped[str] = mapped_column(String(64), nullable=False)
    algorithm: Mapped[str] = mapped_column(String(128), nullable=False)
    input_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    iterations: Mapped[int] = mapped_column(Integer, nullable=False)
    mean_ms: Mapped[float] = mapped_column(nullable=False)
    median_ms: Mapped[float] = mapped_column(nullable=False)
    stdev_ms: Mapped[float] = mapped_column(nullable=False)
    p95_ms: Mapped[float] = mapped_column(nullable=False)
    min_ms: Mapped[float] = mapped_column(nullable=False)
    max_ms: Mapped[float] = mapped_column(nullable=False)
    public_key_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    secret_key_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ciphertext_or_signature_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    run: Mapped[BenchmarkRun] = relationship(back_populates="results")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    file_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(128), nullable=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    detail: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
