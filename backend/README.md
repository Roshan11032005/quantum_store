# PQC Outsourced Storage Backend

FastAPI backend for zero-knowledge outsourced encrypted file storage with post-quantum key/signature metadata verification.

## Threat Model Summary

- Backend is untrusted and does not get plaintext or private keys.
- Client performs encryption/decryption, signing, KEM decapsulation.
- Backend stores ciphertext and cryptographic metadata, verifies integrity/authenticity, enforces ownership.
- Compromise of backend should not expose plaintext; tampering is detected by signed canonical metadata and ciphertext hash checks.

## Features

- PQ challenge-response login and short-lived JWT sessions.
- Deterministic canonical metadata serialization for signatures.
- Multipart file upload with streaming storage and hash verification.
- Pluggable storage backend: local, MinIO, S3.
- Server-side re-verification endpoint for tamper-at-rest detection.
- Benchmark engine (KEM/SIG/AES) with API and CLI export.

## Quick Start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
cp .env.example .env
python scripts/seed_demo.py
uvicorn app.main:app --reload
```

Open `http://localhost:8000/docs`.

## Tests

```bash
pytest -q
```

## Benchmark CLI

```bash
python scripts/run_benchmarks.py --iterations 200 --out results/
```

## Docker

```bash
docker compose up --build
```

The Docker image builds and installs `liboqs` before installing Python dependencies.

## API Prefix

All endpoints are under `/api/v1`.

## Notes

- JWT uses HS256 for session tokens (short-lived, operationally practical). PQ JWT signatures are not implemented.
- `/files/{id}/share` and `/files/{id}/shares` are currently stubs.
