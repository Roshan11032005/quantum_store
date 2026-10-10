# 03 — INTEGRATIONS SPECIFICATION
## Project: Design and Performance Evaluation of a Secure Outsourced Storage System Using NIST Post-Quantum Cryptographic Algorithms

> **Instructions for the AI code assistant:** This file defines how the frontend (`01_FRONTEND.md`), backend (`02_BACKEND.md`), cryptographic libraries, storage systems, and deployment tooling connect. Build the glue, shared contracts, infrastructure, and the Python client/CLI described here.

---

## 1. System Overview

```text
┌────────────────────────────┐        HTTPS / JSON + multipart        ┌─────────────────────────────┐
│  CLIENTS (TRUSTED)         │ ─────────────────────────────────────► │  BACKEND (UNTRUSTED)        │
│                            │                                        │                             │
│  • React web app           │                                        │  FastAPI                    │
│    (WebCrypto + noble +    │ ◄───────────────────────────────────── │   ├─ Auth (PQ challenge)    │
│    Falcon WASM)            │         ciphertext, metadata           │   ├─ Files API              │
│  • Python client / CLI     │                                        │   ├─ Benchmarks API         │
│    (liboqs + cryptography) │                                        │   └─ liboqs (verify/bench)  │
│  • Optional local agent    │                                        └───────┬───────────┬─────────┘
└────────────────────────────┘                                                │           │
                                                                      ┌───────▼───┐  ┌────▼─────────┐
                                                                      │ Database  │  │ Object store │
                                                                      │ SQLite /  │  │ Local / MinIO│
                                                                      │ PostgreSQL│  │ / AWS S3     │
                                                                      └───────────┘  └──────────────┘
```

**Trust boundary:** everything on the left encrypts/decrypts/signs. Everything on the right only stores and verifies. Secret keys and plaintext never cross the boundary.

---

## 2. Integration Map

| # | Integration | Between | Contract |
|---|---|---|---|
| I1 | REST API | Frontend/Client ↔ Backend | OpenAPI schema (`/openapi.json`), §3 |
| I2 | Shared crypto protocol & test vectors | Frontend ↔ Backend ↔ Python client | §5, `shared/vectors/` |
| I3 | liboqs | Backend, Python client | Native library + `liboqs-python`, §6 |
| I4 | noble + WebCrypto + WASM | Frontend | `01_FRONTEND.md` §4, §6 here |
| I5 | Storage backends | Backend ↔ Local/MinIO/S3 | `StorageBackend` interface, §7 |
| I6 | Database | Backend ↔ SQLite/PostgreSQL | SQLAlchemy + Alembic, §8 |
| I7 | Benchmark data exchange | Browser/CLI/Server ↔ Backend ↔ Frontend charts | JSON schema, §9 |
| I8 | Docker / CI | All | §10, §11 |
| I9 | Python client agent (Falcon fallback) | Browser ↔ localhost agent | §4 |

---

## 3. API Contract (I1)

### 3.1 Single source of truth
- The backend publishes OpenAPI 3.1 at `/openapi.json`.
- The frontend generates its typed client from it: `npx openapi-typescript http://localhost:8000/openapi.json -o frontend/src/api/schema.d.ts`.
- The Python client generates or hand-writes models from the same schema. CI fails if the committed schema file `shared/openapi.json` differs from the live one.

### 3.2 Conventions (MUST)
- Base path: `/api/v1`.
- Binary values in JSON: **base64url, no padding**.
- Timestamps: ISO-8601 UTC with `Z`.
- IDs: UUID v4 strings.
- Auth: `Authorization: Bearer <jwt>`.
- Errors: `{ "type": "...", "title": "...", "status": 400, "detail": "..." }`.
- Pagination: `?page=1&page_size=25` → `{ items: [], total, page, page_size }`.
- File upload: `multipart/form-data` with parts `metadata` (string), `kem_ciphertext`, `wrapped_dek`, `signature`, `ciphertext`.
- File download: JSON metadata via `GET /files/{id}`, raw bytes via `GET /files/{id}/content` (`Range` supported).

### 3.3 CORS
Backend allows only `CORS_ORIGINS` (default `http://localhost:5173`). Expose headers `Content-Length`, `Content-Range`, `Accept-Ranges`.

### 3.4 Frontend dev proxy
`vite.config.ts`: proxy `/api` → `http://localhost:8000` to avoid CORS in dev.

---

## 4. Python Client SDK + CLI + Local Agent (I9)

Create `client/` — a Python package `pqcstore` that implements the **client side of the protocol** independently of the browser. Purposes:
1. Reference implementation and cross-compatibility test partner for the web app.
2. Benchmarking in native speed with liboqs (all algorithms including Falcon and SPHINCS+).
3. Falcon fallback for the browser via a localhost agent.
4. Scriptable CLI for demos.

### 4.1 Layout
```text
client/
├── pyproject.toml
├── pqcstore/
│   ├── __init__.py
│   ├── api.py            # httpx client wrapper
│   ├── crypto/
│   │   ├── kem.py        # liboqs ML-KEM
│   │   ├── sig.py        # liboqs ML-DSA / Falcon / SLH-DSA
│   │   ├── aes.py        # chunked AES-256-GCM (cryptography)
│   │   ├── kdf.py        # HKDF-SHA256, Argon2id (argon2-cffi)
│   │   └── canonical.py  # identical to backend canonicalization
│   ├── vault.py          # encrypted key file (.pqckey) compatible with web app
│   ├── protocol.py       # upload() / download() / verify()
│   ├── bench.py          # same operations & output schema as backend
│   ├── agent.py          # FastAPI app bound to 127.0.0.1 (see 4.3)
│   └── cli.py            # Typer CLI
└── tests/
```

### 4.2 CLI commands
```text
pqcstore register   --server URL --username U --kem ML-KEM-768 --sig ML-DSA-65
pqcstore login      --server URL --username U
pqcstore upload     <path> [--sig Falcon-512]
pqcstore ls
pqcstore download   <file_id> -o <path>
pqcstore verify     <file_id>
pqcstore bench      --iterations 200 --out results/ [--upload]
pqcstore export-key --out my.pqckey
pqcstore import-key my.pqckey
```

### 4.3 Local Falcon agent (only if no Falcon WASM available)
- `pqcstore agent --port 8765` binds **127.0.0.1 only**.
- Exposes `POST /sign`, `/verify`, `/keygen` for Falcon (and optionally others).
- Security: random per-session token printed on start, which the user pastes into the web app; strict `Origin` check; no secret key leaves the agent; agent holds the key vault. Document that this is a **demo fallback**, and that the preferred path is in-browser WASM.
- Frontend provider `crypto/providers/agent.ts` implements `SigProvider` by calling the agent.

### 4.4 Vault file format (`.pqckey`) — shared by web and Python (MUST)
```json
{
  "format": "pqckey",
  "version": 1,
  "kdf": { "alg": "argon2id", "salt": "<b64url>", "time_cost": 3, "memory_kib": 65536, "parallelism": 1 },
  "cipher": { "alg": "AES-256-GCM", "nonce": "<b64url>" },
  "ciphertext": "<b64url of AES-GCM(payload)>",
  "public": {
    "username": "alice",
    "kem_alg": "ML-KEM-768", "kem_pk_fp": "<hex16>",
    "sig_alg": "ML-DSA-65", "sig_pk_fp": "<hex16>"
  }
}
```
Payload (encrypted): `{ kem_sk, kem_pk, sig_sk, sig_pk, extra_sig_keys: [...] }`. Import/export between web and CLI MUST round-trip.

---

## 5. Shared Cryptographic Contract and Test Vectors (I2)

### 5.1 Why
Three independent implementations (TypeScript, Python backend, Python client) must agree byte-for-byte on: canonical JSON, HKDF derivation, chunk nonce/AAD construction, wrapped-DEK format, and signed message construction. Any drift silently breaks verification.

### 5.2 Constants (single file `shared/constants.json`)
```json
{
  "hkdf_info_kek": "pqc-storage-kek-v1",
  "login_domain": "pqc-storage-login-v1",
  "chunk_size_default": 4194304,
  "nonce_len": 12,
  "base_nonce_len": 8,
  "tag_len": 16,
  "dek_len": 32,
  "wrapped_dek_layout": "nonce(12) || ciphertext(32) || tag(16)",
  "signed_message": "SHA256(canonical_json(metadata))",
  "encoding_binary_in_json": "base64url-nopad"
}
```

### 5.3 Vectors (`shared/vectors/`)
- `canonical.json` — inputs (metadata objects with tricky ordering/unicode) → expected canonical string and SHA-256.
- `kdf.json` — shared secret + file_id → expected KEK.
- `aes_chunks.json` — fixed DEK, base_nonce, file_id, plaintext chunks → expected ciphertext chunks and SHA-256.
- `wrap.json` — KEK, nonce, DEK, file_id → expected wrapped_dek.
- `signatures.json` — for each signature algorithm: a fixed message, a public key, and a **valid signature produced by liboqs** → every implementation must `verify == true`; plus a tampered case → `false`. (Signing is randomized for some schemes, so test *verification* of fixed vectors, not signature equality.)
- `kem.json` — fixed secret key + ciphertext → expected shared secret (decapsulation is deterministic).
- Generate vectors once with the Python reference (`scripts/gen_vectors.py`) and commit. All three test suites load them.

### 5.4 Cross-compat matrix (MUST pass in CI)
| Uploader → Downloader | Required |
|---|---|
| Web → Web | ✔ |
| Python client → Web | ✔ |
| Web → Python client | ✔ |
| Python client → Python client | ✔ |
For each: upload a 0-byte file, 1-byte file, 4 MiB exact, 4 MiB + 1, and 25 MiB file; compare SHA-256 of download vs original.

---

## 6. Cryptography Library Integration (I3, I4)

| Primitive | Backend (Python) | Python client | Browser |
|---|---|---|---|
| ML-KEM-512/768/1024 | liboqs-python | liboqs-python | `@noble/post-quantum` `ml_kem*` |
| ML-DSA-44/65/87 | liboqs-python | liboqs-python | `@noble/post-quantum` `ml_dsa*` |
| SLH-DSA / SPHINCS+ | liboqs-python | liboqs-python | `@noble/post-quantum` `slh_dsa_*` |
| Falcon-512/1024 | liboqs-python | liboqs-python | liboqs WASM in Worker **or** local agent |
| AES-256-GCM | `cryptography` | `cryptography` | WebCrypto |
| HKDF-SHA256 | `cryptography` | `cryptography` | WebCrypto |
| SHA-256 | `hashlib` | `hashlib` | WebCrypto |
| Argon2id | (not needed) | `argon2-cffi` | `hash-wasm` |

### 6.1 Algorithm name normalization (MUST)
Maintain `shared/algorithms.json` mapping a canonical display name to each library's identifier:

```json
{
  "ML-KEM-768":   { "type": "kem", "liboqs": ["ML-KEM-768", "Kyber768"], "noble": "ml_kem768", "nist_level": 3 },
  "ML-DSA-65":    { "type": "sig", "liboqs": ["ML-DSA-65", "Dilithium3"], "noble": "ml_dsa65", "nist_level": 3 },
  "Falcon-512":   { "type": "sig", "liboqs": ["Falcon-512"], "noble": null, "nist_level": 1 },
  "SLH-DSA-SHA2-128f": { "type": "sig", "liboqs": ["SLH_DSA_PURE_SHA2_128F", "SPHINCS+-SHA2-128f-simple"], "noble": "slh_dsa_sha2_128f", "nist_level": 1 }
}
```
Provide a script that **verifies the mapping at startup** against `oqs.get_enabled_*_mechanisms()` and logs mismatches. (Exact liboqs identifiers vary by version — never assume.)

### 6.2 Known gotchas to handle
- Public/secret key and signature encodings across libraries must be the standard FIPS byte encodings. **Verify cross-library interoperability early** with a spike: generate in liboqs → verify in noble, and vice-versa, for ML-KEM and ML-DSA. If a library uses a different secret-key format (e.g., seed vs expanded), document it and keep each user's keys within a compatible pair or store keys in the format both sides accept.
- Older liboqs versions used pre-standard names/parameters (Kyber/Dilithium round-3). Pin liboqs to a version that implements the final FIPS 203/204/205 algorithms and document the version in benchmark `environment`.
- Falcon signatures are variable-length; SLH-DSA signatures are large — verify multipart/body limits and DB column types accommodate them.
- WASM crypto in browsers is slower than native; benchmark results must always be labeled with the environment (`browser`/`cli`/`server`).

---

## 7. Storage Integrations (I5)

### 7.1 Local filesystem (default)
`STORAGE_BACKEND=local`, `STORAGE_ROOT=./data`. Docker volume mount for persistence.

### 7.2 MinIO (S3-compatible, recommended for the demo)
- Container `minio/minio` with console on :9001.
- Backend creates bucket `pqc-storage` at startup if missing.
- Use `boto3` or `minio` SDK; multipart upload for objects > 8 MiB; server-side encryption NOT relied upon (data is already client-encrypted).
- Object key: `{owner_id}/{file_id}.bin`.

### 7.3 AWS S3 (optional)
- IAM policy limited to a single bucket/prefix (`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket`).
- Block public access; versioning optional.
- Config via env vars; no hard-coded credentials.

### 7.4 Integrity check at the storage layer
The backend computes SHA-256 while streaming into storage; stores it in DB. `POST /files/{id}/verify` re-reads the object and recomputes. Storage-level tampering is thus detectable even without the client.

### 7.5 Threat demo hook (dev only)
`POST /dev/tamper/{file_id}` (enabled only when `APP_ENV=dev` and `ENABLE_TAMPER_DEMO=true`) flips one byte in the stored object so the project demo can show verification failing in the UI. MUST be disabled in any non-dev config.

---

## 8. Database Integration (I6)

- SQLAlchemy 2.x async; SQLite (`aiosqlite`) for dev/tests, PostgreSQL (`asyncpg`) for docker-compose/prod.
- Alembic migrations kept in `backend/alembic/`; CI runs `alembic upgrade head` against both SQLite and Postgres.
- Use portable types (e.g., `LargeBinary`, JSON type that maps to JSONB on Postgres).
- Indices: `files(owner_id, created_at)`, `user_keys(user_id, key_type)`, `auth_challenges(expires_at)`, `benchmark_results(run_id, operation, algorithm)`.
- Periodic cleanup of expired challenges (background task).

---

## 9. Benchmark Data Exchange (I7)

All environments (server, CLI, browser) emit **the same JSON schema** so results can be merged and compared.

```json
{
  "schema_version": 1,
  "environment": {
    "location": "browser | cli | server",
    "os": "...", "cpu": "...", "cores": 8,
    "python": "3.11.x", "liboqs": "x.y.z", "browser": "Chrome 1xx", "noble_version": "x.y.z",
    "timestamp": "2026-10-02T10:00:00Z"
  },
  "params": { "iterations": 100, "warmup": 10, "message_sizes": [32, 1024, 1048576] },
  "results": [
    {
      "category": "kem | sig | aes | e2e",
      "algorithm": "ML-KEM-768",
      "operation": "keygen | encaps | decaps | sign | verify | encrypt | decrypt | upload | download",
      "input_size_bytes": 0,
      "stats_ms": { "mean": 0, "median": 0, "stdev": 0, "p95": 0, "min": 0, "max": 0 },
      "sizes_bytes": { "public_key": 0, "secret_key": 0, "ciphertext": 0, "signature": 0 },
      "throughput_mb_s": null
    }
  ]
}
```

Flow:
1. Browser benchmark worker → JSON → `POST /benchmarks/runs/import` (tagged `browser`).
2. CLI `pqcstore bench --upload` → same endpoint (tagged `cli`).
3. Server-run benchmarks stored directly (tagged `server`).
4. Frontend charts read `GET /benchmarks/runs/{id}` and `/benchmarks/compare`.

Validation: backend validates imports against a Pydantic model mirroring this schema and rejects out-of-range values (negative times, absurd sizes).

---

## 10. Docker and Local Environment (I8)

### 10.1 Repository layout (monorepo)
```text
pqc-secure-storage/
├── backend/
├── frontend/
├── client/
├── shared/
│   ├── constants.json
│   ├── algorithms.json
│   ├── openapi.json
│   └── vectors/
├── scripts/            # gen_vectors.py, wait-for-it, seed
├── docs/               # report material, diagrams
├── docker-compose.yml
├── docker-compose.dev.yml
├── .github/workflows/ci.yml
├── Makefile
└── README.md
```

### 10.2 `docker-compose.yml` services
| Service | Image / build | Ports | Notes |
|---|---|---|---|
| `db` | postgres:16 | 5432 | volume `pgdata` |
| `minio` | minio/minio | 9000, 9001 | volume `miniodata`, creds from env |
| `api` | `./backend` (builds liboqs) | 8000 | depends_on db, minio; healthcheck `/health/ready` |
| `web` | `./frontend` (nginx) | 5173→80 | CSP headers; proxies `/api` to `api` |

### 10.3 Backend Dockerfile requirements
Multi-stage: build liboqs from a pinned tag (cmake, ninja, `-DBUILD_SHARED_LIBS=ON`), install into `/usr/local`, set `LD_LIBRARY_PATH`/`ldconfig`, install `liboqs-python` matching that version, run as non-root user.

### 10.4 Makefile targets
`make dev` (compose up dev), `make test` (all suites), `make vectors`, `make bench` (run CLI benchmark and write `docs/results/`), `make lint`, `make openapi` (regenerate schema + TS types).

### 10.5 Environment files
`.env.example` at root and in `backend/`, `frontend/` (`VITE_API_URL=http://localhost:8000/api/v1`). Never commit real secrets.

---

## 11. CI Pipeline (I8)

GitHub Actions `ci.yml`:
1. **backend:** build liboqs (cached), install deps, ruff + mypy, pytest with coverage.
2. **frontend:** `npm ci`, eslint, tsc, vitest, build.
3. **client:** pytest.
4. **contract:** regenerate OpenAPI → diff against `shared/openapi.json`; run vector tests in all three codebases.
5. **e2e:** `docker compose up -d`, run Playwright + cross-compat matrix.
6. **security:** `pip-audit`, `npm audit --omit=dev`, `trivy` on images, secret scan (gitleaks).

---

## 12. Observability and Operations

- Structured JSON logging (request id, user id, route, status, latency) — never log keys, tokens, or request bodies.
- `/metrics` Prometheus endpoint (optional) with upload/download counts, latencies, verify failures.
- Audit log table (see backend spec) surfaced on a simple admin/Activity page (stretch goal).
- Health checks wired into compose.

---

## 13. End-to-End Integration Scenarios (acceptance tests)

1. **Happy path:** Register (web) → export key → login → upload `report.pdf` with ML-DSA-65 → list → verify on server ✔ → download → SHA-256 equals original.
2. **Algorithm comparison:** Same 10 MB file uploaded using ML-DSA-65, Falcon-512, SLH-DSA-SHA2-128f → UI shows per-stage timings and storage overhead differences; benchmark page reproduces the comparison with full statistics.
3. **Tamper at rest:** Modify one byte of stored ciphertext → server verify returns `hash_ok=false`; web download aborts with `INTEGRITY_FAILED`.
4. **Tamper metadata:** Edit `metadata_json` in DB → signature verification fails client-side (and server-side verify).
5. **Forgery:** A second user tries to upload a file claiming `owner_id` of the first → rejected.
6. **Replay login:** Reuse an old challenge signature → rejected.
7. **Downgrade attempt:** Metadata with disallowed algorithm → rejected.
8. **Cross-client:** Upload via CLI, download via browser (and vice-versa) with the same imported key file.
9. **Storage swap:** Run once with `local`, once with `minio` — identical behavior.
10. **Large file:** 1 GB upload/download via streaming without exceeding memory limits (backend < 200 MB RSS; browser stays responsive).

---

## 14. Suggested Build Order for the AI Code Assistant

1. Repo scaffold, `shared/` constants + algorithm map.
2. Backend: PQC wrapper, canonicalization, DB models, auth, storage (local).
3. Python client: crypto protocol, vault, CLI → generate and commit test vectors.
4. Backend: files API with full verification; negative tests.
5. Frontend: crypto layer (noble + WebCrypto), vectors passing.
6. Frontend: register/login/vault, upload/download pipelines, file list.
7. Interop spike: noble ↔ liboqs key/signature compatibility (do this **early** — before step 6 if possible).
8. Benchmarks: backend engine → CLI → browser worker → UI charts.
9. Falcon in browser (WASM or agent).
10. MinIO/S3 backends, docker-compose, CI, E2E scenarios.
11. Polish: About page, tamper demo, docs, README, report-ready export of results.

---

## 15. Definition of Done

- All 10 acceptance scenarios pass automatically.
- Shared vectors pass in backend, client, and frontend.
- One command (`docker compose up`) starts the full stack; README gets a new developer running in < 15 minutes.
- Benchmark results are produced from real runs, exportable as CSV/JSON, and clearly labeled with their environment.
- No plaintext or secret key is ever observable server-side (verified by a test that scans the DB and storage for a known plaintext marker after upload).