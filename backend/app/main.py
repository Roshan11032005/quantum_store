from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.algorithms import router as algorithms_router
from app.api.v1.auth import router as auth_router
from app.api.v1.benchmarks import router as benchmarks_router
from app.api.v1.files import router as files_router
from app.api.v1.health import router as health_router
from app.api.v1.users import router as users_router
from app.config import get_settings
from app.core.security import TokenError
from app.db.base import Base
from app.db.session import engine


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="PQC Outsourced Storage Backend", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(TokenError)
    async def token_error_handler(_: Request, exc: TokenError):
        return JSONResponse(
            status_code=401,
            content={
                "type": "about:blank",
                "title": "Unauthorized",
                "status": 401,
                "detail": str(exc),
            },
        )

    @app.on_event("startup")
    async def startup() -> None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        # Pre-warm the oqs import so the shared library is loaded once
        # during server startup, not silently on the first user request.
        import logging
        _log = logging.getLogger("app.startup")
        try:
            from app.core.pqc import _load_oqs
            oqs = _load_oqs()
            if oqs is not None:
                _log.info("liboqs ready — version %s", oqs.oqs_version())
            else:
                _log.warning("liboqs-python not available; PQC features will be disabled")
        except Exception as exc:  # noqa: BLE001
            _log.warning("liboqs pre-warm failed: %s", exc)

        # Ensure the MinIO/S3 bucket exists before any request arrives.
        if settings.storage_backend in ("minio", "s3"):
            import boto3
            import botocore.exceptions
            endpoint = f"http://{settings.minio_endpoint}" if settings.storage_backend == "minio" else None
            s3 = boto3.client(
                "s3",
                region_name=settings.s3_region or None,
                endpoint_url=endpoint,
                aws_access_key_id=settings.minio_access_key if endpoint else None,
                aws_secret_access_key=settings.minio_secret_key if endpoint else None,
            )
            bucket = settings.minio_bucket if settings.storage_backend == "minio" else settings.s3_bucket
            try:
                s3.head_bucket(Bucket=bucket)
                _log.info("Bucket '%s' already exists", bucket)
            except botocore.exceptions.ClientError as e:
                code = e.response["Error"]["Code"]
                if code in ("404", "NoSuchBucket"):
                    s3.create_bucket(Bucket=bucket)
                    _log.info("Created bucket '%s'", bucket)
                else:
                    _log.warning("Could not verify bucket '%s': %s", bucket, e)

    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(users_router, prefix="/api/v1")
    app.include_router(files_router, prefix="/api/v1")
    app.include_router(algorithms_router, prefix="/api/v1")
    app.include_router(benchmarks_router, prefix="/api/v1")
    app.include_router(health_router, prefix="/api/v1")
    return app


app = create_app()
