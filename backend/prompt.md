# 02 — BACKEND SPECIFICATION
## Project: Design and Performance Evaluation of a Secure Outsourced Storage System Using NIST Post-Quantum Cryptographic Algorithms

> **Instructions for the AI code assistant:** Read this file together with `01_FRONTEND.md` and `03_INTEGRATIONS.md`. Implement everything described here. Where a decision is marked **MUST**, do not deviate. Where marked **SHOULD**, use judgment.

---

## 1. Purpose of the Backend

The backend is an **untrusted storage server**. It stores encrypted files and their cryptographic metadata, and it authenticates users. It must be designed so that **even a fully compromised backend cannot read, modify undetected, or forge a user's files**.

### 1.1 Zero-knowledge rule (MUST)
- The backend **never** receives plaintext files.
- The backend **never** receives users' secret keys (ML-KEM secret key, signature secret key).
- The backend **never** receives the AES file key (DEK) in unwrapped form.
- All encryption, decryption, signing, and KEM decapsulation happen **on the client** (browser or Python CLI client — see `03_INTEGRATIONS.md`).
- The backend only: stores blobs, stores metadata, stores public keys, verifies signatures (as an extra check), authenticates users, and runs/records benchmarks.

### 1.2 What the backend IS allowed to do
- Verify signatures on upload (defense in depth — rejects forged/garbled uploads early).
- Verify the ciphertext SHA-256 hash matches what the metadata claims.
- Enforce ownership/access control.
- Run PQC benchmarks server-side using liboqs and store results.

---

## 2. Technology Stack (MUST unless noted)

| Concern | Choice |
|---|---|
| Language | Python 3.11+ |
| Web framework | FastAPI + Uvicorn |
| PQC library | `liboqs-python` (Open Quantum Safe) |
| Symmetric crypto (server side, only if needed) | `cryptography` package |
| Hashing | `hashlib` SHA-256 |
| Database | SQLite for dev, PostgreSQL for prod (SQLAlchemy 2.x + Alembic) |
| Object storage | Pluggable: Local filesystem (default), MinIO, AWS S3 (SHOULD use `boto3`) |
| Auth | PQ challenge–response → short-lived JWT (`pyjwt`) |
| Validation | Pydantic v2 |
| Config | `pydantic-settings` + `.env` |
| Testing | `pytest`, `httpx`, `pytest-asyncio` |
| Packaging | `pyproject.toml`, Dockerfile, docker-compose |

> liboqs-python requires the native liboqs C library. The Dockerfile MUST build or install liboqs. Algorithm names differ across liboqs versions (e.g., `ML-KEM-768`, `ML-DSA-65`, `Falcon-512`, `SPHINCS+-SHA2-128f-simple` or `SLH_DSA_PURE_SHA2_128F` in newer builds). **At startup, call `oqs.get_enabled_kem_mechanisms()` and `oqs.get_enabled_sig_mechanisms()` and map friendly names to whatever is available.** Expose this list at `GET /api/v1/algorithms`.

---

## 3. Directory Structure

```text
backend/
├── pyproject.toml
├── Dockerfile
├── .env.example
├── alembic/
├── app/
│   ├── main.py                  # FastAPI app factory, CORS, routers
│   ├── config.py                # Settings
│   ├── deps.py                  # DB session, current_user, storage dependency
│   ├── db/
│   │   ├── base.py
│   │   ├── models.py            # SQLAlchemy models
│   │   └── session.py
│   ├── schemas/                 # Pydantic request/response models
│   │   ├── auth.py
│   │   ├── files.py
│   │   ├── benchmarks.py
│   │   └── algorithms.py
│   ├── api/v1/
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── files.py
│   │   ├── algorithms.py
│   │   ├── benchmarks.py
│   │   └── health.py
│   ├── core/
│   │   ├── security.py          # JWT, challenge handling
│   │   ├── pqc.py               # liboqs wrapper (KEM + SIG abstraction)
│   │   ├── canonical.py         # Canonical metadata serialization (critical)
│   │   └── errors.py
│   ├── storage/
│   │   ├── base.py              # StorageBackend abstract class
│   │   ├── local.py
│   │   ├── minio_backend.py
│   │   └── s3_backend.py
│   ├── services/
│   │   ├── file_service.py
│   │   ├── auth_service.py
│   │   └── benchmark_service.py
│   └── benchmarks/
│       ├── runner.py            # Shared benchmark logic (also used by CLI)
│       └── stats.py             # mean/median/stdev/p95
├── tests/
└── scripts/
    ├── run_benchmarks.py        # CLI -> writes JSON + CSV
    └── seed_demo.py
```

---

## 4. Cryptographic Protocol (AUTHORITATIVE — MUST follow)

This is the core of the project. The backend verifies it; the client performs it.

### 4.1 Key material per user (generated on client)
1. **KEM keypair** — ML-KEM (default `ML-KEM-768`). Public key uploaded to server; secret key stays on client.
2. **Signature keypair** — one of ML-DSA / Falcon / SLH-DSA (SPHINCS+). User picks a default; public key and algorithm name uploaded to server. A user MAY register more than one signature key (for benchmarking comparisons).

### 4.2 Upload protocol (client-side)
```text
1. DEK  = random 32 bytes                             (AES-256 key, unique per file)
2. Encrypt file with AES-256-GCM using DEK            -> ciphertext (chunked, see 4.5)
3. (kem_ct, ss) = ML-KEM.Encaps(recipient_kem_pk)     (recipient = owner for private storage)
4. KEK  = HKDF-SHA256(ikm=ss, salt=file_id, info="pqc-storage-kek-v1", len=32)
5. wrapped_dek = AES-256-GCM(KEK, nonce_w, DEK, aad=file_id)   -> nonce_w || ct || tag
6. ciphertext_sha256 = SHA256(ciphertext)
7. Build canonical metadata M (see 4.4)
8. signature = SIG.Sign(sig_sk, SHA256(canonical(M)))     # encrypt-then-sign
9. Upload: ciphertext blob + M + kem_ct + wrapped_dek + signature
```

> **Why this differs slightly from a naive "KEM encrypts the AES key" description:** ML-KEM does not encrypt arbitrary data. It produces a *shared secret*. We derive a key-encryption key (KEK) from that secret and use it to wrap the random file key (DEK). This is the standard KEM-DEM / hybrid-encryption construction.

> **Why sign metadata + ciphertext hash and not only SHA256(file):** signing the plaintext hash would leak whether a known file is stored and would not bind the KEM ciphertext, nonce, or file ID. Signing canonical metadata (which includes the ciphertext hash, KEM ciphertext hash, algorithm names, file ID, owner ID, and timestamp) binds everything and prevents swap/replay/downgrade attacks.

### 4.3 Download protocol (client-side)
```text
1. GET metadata + signature + kem_ct + wrapped_dek + ciphertext
2. Verify SHA256(ciphertext) == M.ciphertext_sha256
3. Verify signature over SHA256(canonical(M)) using owner's sig public key
   -> FAIL = abort, show "Integrity/Authenticity check failed"
4. ss  = ML-KEM.Decaps(kem_sk, kem_ct)
5. KEK = HKDF(...) same params
6. DEK = AES-GCM-Decrypt(KEK, wrapped_dek, aad=file_id)
7. Decrypt ciphertext chunks with DEK (GCM tag verified per chunk)
8. Return plaintext
```

### 4.4 Canonical metadata (MUST be deterministic)
The signed message is `SHA256(canonical_json(M))` where canonical JSON = UTF-8, keys sorted, no whitespace, no floating point, binary values base64url without padding. Implement in `core/canonical.py` and **mirror exactly** in the frontend and Python client (shared test vectors required — see `03_INTEGRATIONS.md`).

```json
{
  "version": 1,
  "file_id": "uuid-v4",
  "owner_id": "uuid-v4",
  "original_filename": "report.pdf",
  "original_size": 1048576,
  "mime_type": "application/pdf",
  "sym_alg": "AES-256-GCM",
  "chunk_size": 4194304,
  "chunk_count": 1,
  "base_nonce": "<base64url 8 bytes>",
  "kem_alg": "ML-KEM-768",
  "kem_ct_sha256": "<hex>",
  "wrapped_dek_sha256": "<hex>",
  "sig_alg": "ML-DSA-65",
  "ciphertext_sha256": "<hex>",
  "ciphertext_size": 1048608,
  "created_at": "2026-10-02T10:00:00Z"
}
```

`original_filename` leaks information to the server. **SHOULD** make filename-hiding optional: if enabled, the client encrypts the filename into the wrapped payload and puts a placeholder here.

### 4.5 Chunked AES-GCM (MUST for files > 4 MiB; SHOULD for all)
- Chunk size default 4 MiB (configurable).
- Nonce for chunk *i* = `base_nonce (8 bytes) || uint32_be(i)` (12 bytes total). Never reuse a nonce with the same DEK.
- AAD for each chunk = `file_id || uint32_be(i) || uint32_be(chunk_count) || final_flag(1 byte)` to prevent chunk reordering and truncation.
- Ciphertext chunk = encrypted bytes + 16-byte tag.

---

## 5. Database Schema

### 5.1 `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| username | text unique | |
| created_at | timestamptz | |
| is_active | bool | |

### 5.2 `user_keys`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | FK users | |
| key_type | enum(`kem`,`sig`) | |
| algorithm | text | e.g. `ML-KEM-768`, `Falcon-512` |
| public_key | bytea | |
| public_key_sha256 | text | fingerprint shown in UI |
| is_default | bool | |
| created_at | timestamptz | |
| revoked_at | timestamptz null | |

### 5.3 `files`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | client-generated file_id, server validates uniqueness |
| owner_id | FK users | |
| storage_key | text | path/object key of ciphertext |
| metadata_json | jsonb/text | exact canonical string as signed |
| kem_ciphertext | bytea | |
| wrapped_dek | bytea | |
| signature | bytea | |
| sig_key_id | FK user_keys | which public key signs it |
| ciphertext_size | bigint | |
| ciphertext_sha256 | text | |
| created_at | timestamptz | |
| deleted_at | timestamptz null | soft delete |

### 5.4 `auth_challenges`
| id | user_id | nonce (32 bytes) | expires_at | used (bool) |

### 5.5 `benchmark_runs`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| created_by | FK users null | |
| environment | jsonb | CPU model, OS, liboqs version, python version, location (`server`/`browser`/`cli`) |
| params | jsonb | iterations, message sizes, file sizes |
| started_at / finished_at | timestamptz | |

### 5.6 `benchmark_results`
| run_id | operation (`keygen`,`encaps`,`decaps`,`sign`,`verify`,`aes_encrypt`,`aes_decrypt`,`e2e_upload`,`e2e_download`) | algorithm | input_size_bytes | iterations | mean_ms | median_ms | stdev_ms | p95_ms | min_ms | max_ms | public_key_bytes | secret_key_bytes | ciphertext_or_signature_bytes |

### 5.7 `audit_log`
| id | user_id | action | file_id | ip | at | detail jsonb | — append-only |

---

## 6. REST API (prefix `/api/v1`)

All JSON except file transfer. Binary fields in JSON are **base64url without padding**. Errors use RFC 7807 style: `{ "type", "title", "status", "detail" }`.

### 6.1 Auth (post-quantum challenge–response; no passwords)
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Body: `{username, kem:{algorithm, public_key}, sig:{algorithm, public_key}}`. Creates user + keys. Returns user + key fingerprints. |
| POST | `/auth/challenge` | Body: `{username}`. Returns `{challenge_id, nonce, expires_in}` (nonce 32 random bytes, TTL 60 s, one-time). |
| POST | `/auth/verify` | Body: `{challenge_id, signature}`. Signature = `SIG.Sign(sk, "pqc-storage-login-v1" ‖ nonce ‖ username)`. Server verifies with registered sig public key → returns `{access_token, token_type, expires_in}`. |
| POST | `/auth/logout` | Optional token denylist. |

Rate-limit `/auth/challenge` and `/auth/verify` (e.g., 10/min/IP, `slowapi`). Use constant-time compare where applicable. Always return a generic error for unknown usernames to avoid user enumeration (still issue a dummy challenge).

### 6.2 Users and keys
| Method | Path | Description |
|---|---|---|
| GET | `/users/me` | Profile |
| GET | `/users/me/keys` | List own keys |
| POST | `/users/me/keys` | Add a new signature or KEM public key (must be signed by an existing sig key) |
| DELETE | `/users/me/keys/{id}` | Revoke key |
| GET | `/users/{username}/public-keys` | Public keys for sharing (KEM pk needed to share files) |

### 6.3 Files
| Method | Path | Description |
|---|---|---|
| POST | `/files` | **Multipart upload.** Parts: `metadata` (JSON string exactly as signed), `kem_ciphertext`, `wrapped_dek`, `signature`, `ciphertext` (stream). Server: validates size limits → streams ciphertext to storage while computing SHA-256 → checks hash equals `metadata.ciphertext_sha256` → verifies signature against `sig_key_id` public key (liboqs) → checks `owner_id == token user` → persists. Returns `201 {file_id, ...}`. Reject on any failure and delete partial blob. |
| GET | `/files` | List own files (paginated, sortable). Returns metadata summaries. |
| GET | `/files/{id}` | Metadata + signature + kem_ct + wrapped_dek (JSON). |
| GET | `/files/{id}/content` | Streams ciphertext. Support HTTP `Range`. |
| DELETE | `/files/{id}` | Soft delete + remove blob (config). |
| POST | `/files/{id}/verify` | Server-side re-verification (hash + signature). Returns `{hash_ok, signature_ok, checked_at}`. Useful for audit demo. |
| POST | `/files/{id}/share` | (SHOULD, stretch goal) Body: `{recipient_username, kem_ct_for_recipient, wrapped_dek_for_recipient, signature}`. Client re-wraps DEK for the recipient's KEM public key. |
| GET | `/files/{id}/shares` | List shares |

Max upload size configurable (`MAX_UPLOAD_BYTES`, default 500 MiB). Use streaming — never load whole file into memory.

### 6.4 Algorithms
| GET | `/algorithms` | Returns enabled KEMs and SIGs with NIST security level, key/signature sizes (from liboqs `details`), plus a `recommended` flag. |

### 6.5 Benchmarks
| Method | Path | Description |
|---|---|---|
| POST | `/benchmarks/run` | Body: `{kems:[...], sigs:[...], iterations:100, message_sizes:[1024, 1048576], file_sizes_mb:[1,10,100], include_e2e:true}`. Runs as background task; returns `{run_id}`. |
| GET | `/benchmarks/runs` | List runs |
| GET | `/benchmarks/runs/{id}` | Status + results |
| GET | `/benchmarks/runs/{id}/export?format=csv\|json` | Download |
| POST | `/benchmarks/runs/import` | Upload results measured in the browser or CLI client so the UI can compare environments |
| GET | `/benchmarks/compare?runs=a,b` | Aggregated comparison |

### 6.6 Health
`GET /health` (liveness), `GET /health/ready` (DB + storage + liboqs loaded).

---

## 7. Storage Abstraction

```python
class StorageBackend(ABC):
    async def put(self, key: str, stream: AsyncIterator[bytes]) -> PutResult   # returns size, sha256
    async def get(self, key: str, start: int | None = None, end: int | None = None) -> AsyncIterator[bytes]
    async def delete(self, key: str) -> None
    async def exists(self, key: str) -> bool
```
- `local.py` — files under `STORAGE_ROOT/{owner_id[:2]}/{owner_id}/{file_id}.bin`. Write to temp file then atomic rename.
- `minio_backend.py` / `s3_backend.py` — multipart upload for large files. Select via `STORAGE_BACKEND=local|minio|s3`.
- Storage keys are random/uuid based — never include the original filename.

---

## 8. PQC Wrapper (`core/pqc.py`)

```python
class KEM:
    def __init__(self, alg: str): ...
    def keygen(self) -> tuple[bytes, bytes]: ...             # pk, sk
    def encaps(self, pk: bytes) -> tuple[bytes, bytes]: ...  # ct, ss
    def decaps(self, sk: bytes, ct: bytes) -> bytes: ...

class Signer:
    def __init__(self, alg: str): ...
    def keygen(self) -> tuple[bytes, bytes]: ...
    def sign(self, sk: bytes, msg: bytes) -> bytes: ...
    def verify(self, pk: bytes, msg: bytes, sig: bytes) -> bool: ...
```
- Friendly-name → liboqs-name mapping table, resolved at startup against enabled mechanisms.
- Wrap all liboqs calls so errors become typed exceptions.
- Falcon signatures are variable length (not constant) — don't assume fixed size.
- SLH-DSA/SPHINCS+ signing is slow and signatures large (8–50 KB depending on variant) — set request timeouts and size limits accordingly.

---

## 9. Benchmark Engine (`benchmarks/runner.py`)

Measure with `time.perf_counter_ns()`. For each algorithm:

**KEM:** keygen, encaps, decaps → also record `public_key_bytes`, `secret_key_bytes`, `ciphertext_bytes`, `shared_secret_bytes`.
**Signatures:** keygen, sign, verify (for message sizes 32 B [hash], 1 KB, 1 MB) → record `public_key_bytes`, `secret_key_bytes`, `signature_bytes` (mean and max for Falcon).
**AES-256-GCM:** encrypt/decrypt throughput for 1 MB, 10 MB, 100 MB (MB/s).
**End-to-end (the key experiment):** full upload pipeline and full download pipeline per signature algorithm for several file sizes; also report the total storage overhead (`ciphertext + kem_ct + wrapped_dek + signature + metadata` vs original) and communication overhead (bytes over the wire).

Methodology (MUST):
- Warm-up runs (default 10) discarded.
- ≥ 100 iterations (configurable); report mean, median, stdev, p95, min, max.
- Pin/disclose environment (CPU, OS, liboqs version, Python version, power mode). Store in `environment`.
- Disable GC during timed sections (`gc.disable()` then re-enable).
- Run algorithms in randomized order across repeats to reduce drift bias.
- Never hard-code results. All numbers in the UI/report come from DB.

CLI: `python scripts/run_benchmarks.py --iterations 200 --out results/` writes `results.json` and per-table CSVs.

---

## 10. Security Requirements

- TLS everywhere in prod (reverse proxy). HSTS.
- JWT: 15-minute expiry, HS256 with strong secret or EdDSA; contains `sub`, `jti`. (Note: JWT signing with classical algorithms is acceptable for session tokens — they're short-lived; document this as a known limitation in the report.)
- CORS: allow only configured frontend origin.
- Request size limits, rate limiting, input validation on every endpoint.
- Never log secrets, tokens, key material, or full request bodies.
- Constant-time comparisons for hashes.
- Strict ownership checks on every file/key endpoint (return 404 not 403 for others' files).
- Replay protection: challenges one-time, expire in 60 s; uploads reject duplicate `file_id`.
- Timestamp sanity: reject metadata `created_at` more than ±10 min from server time.
- Algorithm allow-list: reject metadata whose `kem_alg`/`sig_alg`/`sym_alg` isn't in config (prevents downgrade).
- Audit log for register, login, upload, download, delete, verify, share, key changes.
- Dependency pinning and `pip-audit` in CI.

---

## 11. Configuration (`.env.example`)

```env
APP_ENV=dev
DATABASE_URL=sqlite+aiosqlite:///./dev.db
STORAGE_BACKEND=local            # local | minio | s3
STORAGE_ROOT=./data
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=pqc-storage
S3_BUCKET=
S3_REGION=
JWT_SECRET=change-me
JWT_EXPIRE_MINUTES=15
CORS_ORIGINS=http://localhost:5173
MAX_UPLOAD_BYTES=524288000
ALLOWED_KEMS=ML-KEM-512,ML-KEM-768,ML-KEM-1024
ALLOWED_SIGS=ML-DSA-44,ML-DSA-65,ML-DSA-87,Falcon-512,Falcon-1024,SLH-DSA-SHA2-128f,SLH-DSA-SHA2-128s
DEFAULT_KEM=ML-KEM-768
DEFAULT_SIG=ML-DSA-65
CHUNK_SIZE=4194304
```

---

## 12. Testing Requirements

- **Unit:** each KEM/SIG roundtrip; canonical JSON determinism; HKDF/KEK derivation vectors; chunk nonce/AAD construction.
- **Integration (httpx):** register → challenge → verify → upload → list → download-metadata → verify → delete.
- **Negative tests (MUST):** flip 1 byte of ciphertext → upload rejected (hash mismatch); flip 1 byte of metadata → signature invalid; wrong signer → rejected; replayed challenge → rejected; expired challenge → rejected; algorithm downgrade → rejected; other user's file → 404; oversize upload → 413.
- **Tamper-at-rest test:** modify stored blob on disk → `/files/{id}/verify` reports `hash_ok=false`.
- **Cross-implementation vectors:** JSON file of fixed inputs/outputs shared with frontend and Python client.
- Target ≥ 85% coverage on `core/` and `services/`.

---

## 13. Deliverables Checklist

- [ ] FastAPI app with all endpoints above, OpenAPI docs at `/docs`
- [ ] Alembic migrations
- [ ] Storage backends: local (required), MinIO (required), S3 (optional)
- [ ] liboqs wrapper with algorithm discovery
- [ ] Benchmark engine + CLI + API
- [ ] Dockerfile (builds liboqs) and `docker-compose.yml` (api + postgres + minio)
- [ ] Test suite with negative/tamper tests
- [ ] `README.md` with run instructions and threat model summary