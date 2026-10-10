from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "dev"
    database_url: str = "sqlite+aiosqlite:///./dev.db"

    storage_backend: Literal["local", "minio", "s3"] = "local"
    storage_root: str = "./data"
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "pqc-storage"
    s3_bucket: str = ""
    s3_region: str = ""

    jwt_secret: str = "change-me"
    jwt_expire_minutes: int = 15

    cors_origins: str = "http://localhost:5173"
    max_upload_bytes: int = 524_288_000

    allowed_kems: str = "ML-KEM-512,ML-KEM-768,ML-KEM-1024"
    allowed_sigs: str = "ML-DSA-44,ML-DSA-65,ML-DSA-87,Falcon-512,Falcon-1024,SLH-DSA-SHA2-128f,SLH-DSA-SHA2-128s"
    default_kem: str = "ML-KEM-768"
    default_sig: str = "ML-DSA-65"

    chunk_size: int = 4_194_304
    auth_challenge_ttl_seconds: int = 60

    @property
    def cors_origins_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]

    @property
    def allowed_kems_list(self) -> list[str]:
        return [x.strip() for x in self.allowed_kems.split(",") if x.strip()]

    @property
    def allowed_sigs_list(self) -> list[str]:
        return [x.strip() for x in self.allowed_sigs.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
