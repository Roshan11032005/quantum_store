# 01 — FRONTEND SPECIFICATION
## Project: Design and Performance Evaluation of a Secure Outsourced Storage System Using NIST Post-Quantum Cryptographic Algorithms

> **Instructions for the AI code assistant:** Read this file together with `02_BACKEND.md` and `03_INTEGRATIONS.md`. The cryptographic protocol is defined authoritatively in `02_BACKEND.md` §4 — the frontend must implement the **client side** of that protocol exactly.

---

## 1. Purpose

A web application where users can:

1. Register / log in using **post-quantum keys** (no passwords sent to the server)
2. **Upload** files — encrypted and signed *in the browser* before leaving the device
3. **Store** files on an untrusted server
4. **Download** files — signature and integrity verified, then decrypted *in the browser*
5. **Verify** file integrity and authenticity on demand
6. **Run and visualize performance benchmarks** comparing ML-KEM, ML-DSA, Falcon, and SPHINCS+/SLH-DSA

### 1.1 Core principle (MUST)
**Plaintext files and secret keys never leave the browser.** The frontend is the trusted client; the backend is untrusted.

---

## 2. Technology Stack

| Concern | Choice |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui (or MUI if preferred) |
| Routing | React Router v6 |
| State / data fetching | TanStack Query + Zustand (for in-memory key vault state) |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| HTTP | `fetch` wrapper (or axios) with streaming support |
| PQC in browser | `@noble/post-quantum` (ML-KEM, ML-DSA, SLH-DSA) — pure JS, audited-style implementation |
| Falcon in browser | **Not in noble.** Use liboqs compiled to WebAssembly (e.g., a liboqs-wasm build) loaded in a Web Worker; if unavailable, fall back to the Python client agent (see `03_INTEGRATIONS.md` §4). Wrap behind the same interface. |
| Symmetric crypto | Web Crypto API (`crypto.subtle`) — AES-256-GCM, HKDF, SHA-256 |
| Key-at-rest protection | Argon2id (via `hash-wasm` or `argon2-browser`) to derive a wrapping key; AES-GCM encrypts the secret key bundle |
| Heavy work | Web Workers (Comlink) so the UI never blocks |
| Testing | Vitest + React Testing Library + Playwright (E2E) |

> **Never write custom crypto primitives.** Use the libraries above. The frontend's job is orchestration of the protocol.

---

## 3. Directory Structure

```text
frontend/
├── package.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes.tsx
│   ├── api/
│   │   ├── client.ts             # fetch wrapper, token handling
│   │   ├── auth.ts
│   │   ├── files.ts
│   │   ├── algorithms.ts
│   │   └── benchmarks.ts
│   ├── crypto/
│   │   ├── interfaces.ts         # KemProvider, SigProvider
│   │   ├── providers/
│   │   │   ├── noble.ts          # ML-KEM, ML-DSA, SLH-DSA
│   │   │   ├── oqsWasm.ts        # Falcon (and others) via WASM
│   │   │   └── agent.ts          # fallback: local Python agent over localhost
│   │   ├── aes.ts                # AES-256-GCM chunked encrypt/decrypt (WebCrypto)
│   │   ├── hkdf.ts
│   │   ├── canonical.ts          # canonical JSON (MUST match backend)
│   │   ├── protocol.ts           # uploadPipeline(), downloadPipeline()
│   │   ├── keyVault.ts           # generate, lock/unlock, export/import keys
│   │   ├── encoding.ts           # base64url, hex, bytes helpers
│   │   └── workers/
│   │       ├── crypto.worker.ts
│   │       └── bench.worker.ts
│   ├── store/
│   │   ├── authStore.ts
│   │   └── vaultStore.ts         # unlocked keys live ONLY in memory
│   ├── pages/
│   │   ├── Landing.tsx
│   │   ├── Register.tsx
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Files.tsx
│   │   ├── Upload.tsx
│   │   ├── FileDetail.tsx
│   │   ├── Keys.tsx
│   │   ├── Benchmarks.tsx
│   │   ├── BenchmarkRun.tsx
│   │   ├── Compare.tsx
│   │   ├── Algorithms.tsx
│   │   └── About.tsx             # explains the protocol & threat model
│   ├── components/
│   │   ├── layout/ (AppShell, Sidebar, Topbar)
│   │   ├── upload/ (DropZone, PipelineStepper, AlgorithmPicker)
│   │   ├── files/ (FileTable, IntegrityBadge, FileActions)
│   │   ├── keys/ (KeyCard, UnlockDialog, ExportDialog, Fingerprint)
│   │   ├── bench/ (BenchForm, ResultsTable, charts/*)
│   │   └── common/ (Toast, ConfirmDialog, CopyButton, ByteSize)
│   ├── hooks/
│   ├── types/
│   └── utils/
├── tests/
│   ├── vectors/                  # shared cross-implementation test vectors
│   └── e2e/
└── public/
```

---

## 4. Crypto Layer Design

### 4.1 Provider interfaces (MUST)
```ts
export interface KemProvider {
  readonly name: string;                         // "ML-KEM-768"
  keygen(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }>;
  encapsulate(publicKey: Uint8Array): Promise<{ ciphertext: Uint8Array; sharedSecret: Uint8Array }>;
  decapsulate(secretKey: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array>;
}

export interface SigProvider {
  readonly name: string;                         // "ML-DSA-65" | "Falcon-512" | "SLH-DSA-SHA2-128f"
  keygen(): Promise<{ publicKey: Uint8Array; secretKey: Uint8Array }>;
  sign(secretKey: Uint8Array, message: Uint8Array): Promise<Uint8Array>;
  verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): Promise<boolean>;
}
```
A registry maps algorithm names (from `GET /api/v1/algorithms`) to providers. The UI only offers algorithms that **both** the server and a local provider support.

### 4.2 Upload pipeline (`protocol.ts → uploadPipeline`)
Implements `02_BACKEND.md` §4.2 and §4.5 exactly:

1. Generate `file_id` (UUID v4) and random 32-byte DEK.
2. Read file in 4 MiB chunks (`File.stream()` / `slice()`); AES-256-GCM encrypt each chunk with nonce `base_nonce(8) ‖ uint32_be(i)` and AAD `file_id ‖ i ‖ chunk_count ‖ final_flag`. Compute SHA-256 of the ciphertext incrementally.
3. `ML-KEM.encapsulate(own KEM public key)` → `kem_ct`, `ss`.
4. `KEK = HKDF-SHA256(ss, salt=file_id, info="pqc-storage-kek-v1")` → AES-GCM wrap DEK → `wrapped_dek`.
5. Build metadata object; canonicalize; hash; sign with the selected signature provider.
6. Send multipart upload (stream the ciphertext; show progress).
7. Zeroize DEK, KEK, `ss` buffers (`.fill(0)`) after use (best effort in JS).

The pipeline emits **progress events** per stage so the UI stepper can show: `Encrypting → Encapsulating key → Signing → Uploading → Server verified ✔`. Also record **per-stage timings** (ms) and display them after upload — this feeds the performance story.

### 4.3 Download pipeline
Implements `02_BACKEND.md` §4.3. Stages: `Fetching → Verifying hash → Verifying signature → Decapsulating → Decrypting → Done`. If hash or signature verification fails, **abort and show a red tamper warning; do not offer the decrypted file**. Provide a "Download anyway (unsafe)" option only behind an explicit advanced-mode toggle, off by default.

For large files, stream-decrypt chunk by chunk and use the File System Access API / `StreamSaver` pattern where available; otherwise assemble a `Blob` (warn above ~1 GB).

### 4.4 Key vault
- Keys are generated in the browser (Register page).
- Secret keys are **never sent anywhere**.
- At rest: stored in IndexedDB as an encrypted bundle: `AES-256-GCM(Argon2id(passphrase), {kem_sk, sig_sk, metadata})`.
- Unlocked keys live only in memory (Zustand, not persisted); auto-lock after configurable idle time (default 10 min) and on tab close.
- **Export / backup**: download an encrypted key file (`.pqckey`). **Import** on another device. Show a prominent warning: *losing the secret key means losing access to all files; the server cannot recover them.*
- Show **key fingerprints** (first 16 hex chars of SHA-256 of public key) in a friendly grouped format.

### 4.5 Canonical JSON
`canonical.ts` must produce byte-identical output to `backend/app/core/canonical.py` and the Python client. Validate against the shared vectors in `tests/vectors/canonical.json` in CI.

---

## 5. Pages and UX

Design: clean, professional, dark/light theme, responsive (desktop first, usable on tablet). Use security-themed visuals sparingly. Accessibility: WCAG AA, keyboard navigable, ARIA labels on status badges.

### 5.1 Landing
Short pitch, the one-line summary: *"A quantum-resistant cloud storage system that uses NIST-standardized post-quantum cryptography for secure file storage, authentication, and performance evaluation."* Buttons: Register, Login, View Benchmarks.

### 5.2 Register
1. Enter username.
2. Choose KEM (default ML-KEM-768) and signature algorithm (default ML-DSA-65) with a short description of trade-offs of each.
3. Set a strong passphrase (strength meter).
4. Generate keys in a worker (progress indicator) → store encrypted in IndexedDB → send **public keys only** to `POST /auth/register`.
5. Force the user to download the encrypted key backup before continuing.

### 5.3 Login
Username → unlock vault with passphrase → `POST /auth/challenge` → sign nonce locally → `POST /auth/verify` → store JWT in memory (not localStorage). Handle "no local keys on this device → import key file".

### 5.4 Dashboard
Cards: total files, total encrypted storage used, last upload, signature algorithm in use, integrity status summary. Quick buttons: Upload, Run benchmark.

### 5.5 Upload
- Drag-and-drop zone (multi-file queue).
- Algorithm picker: signature algorithm dropdown (default from user's keys; allows choosing any registered sig key). Informational tooltip showing expected signature size and relative speed.
- Optional "hide filename from server" toggle.
- **PipelineStepper** with live progress and timings.
- On completion: show file ID, ciphertext hash (short), signature size, total overhead vs original, and a "Verify on server" button.

### 5.6 Files
Table: name, size (original), stored size, uploaded date, sig algorithm, integrity badge (✔ verified / ⚠ not yet verified / ✖ failed), actions (Download, Verify, Details, Delete, Share*). Search, sort, pagination.

### 5.7 File Detail
Show: all metadata fields, signature algorithm and size, KEM algorithm, ciphertext hash, wrapped-DEK size, timeline of verifications. **"Tamper demo" button** (dev/demo mode only): asks the user to pick a stored object to be modified locally in a downloaded copy and demonstrates failed verification — or call a backend dev-only endpoint that flips a byte. Purpose: prove integrity detection live during project presentation.

### 5.8 Keys
List own keys with algorithm, fingerprint, created date, default flag, revoke. Add new signature key (to compare algorithms). Export/import vault. Rotate.

### 5.9 Benchmarks (most important for evaluation)
**Run panel**
- Select environment: `Browser`, `Server`, `Both`.
- Select KEMs and signature algorithms (multi-select).
- Iterations (default 100), message sizes (32 B hash, 1 KB, 1 MB), file sizes for end-to-end (1, 10, 100 MB).
- Start → progress bar → results.

**Results visualization (Recharts)**
1. Grouped bar: sign time vs verify time per signature algorithm.
2. Bar: key generation time per algorithm.
3. Bar: public key size, secret key size, signature size (log-scale toggle, since SPHINCS+ is much larger).
4. ML-KEM: keygen / encaps / decaps times + key/ciphertext sizes for 512/768/1024.
5. Line: end-to-end upload and download time vs file size, one line per signature algorithm.
6. Stacked bar: per-upload storage overhead breakdown (ciphertext, KEM ct, wrapped DEK, signature, metadata).
7. Throughput: AES-256-GCM MB/s.
8. Optional radar chart: normalized comparison (speed, signature size, key size, security level).

**Tables** with mean, median, stdev, p95, min, max. Export buttons: CSV, JSON, PNG of charts. A **Compare** page overlays two runs (e.g., Browser vs Server, or two machines).

All displayed numbers come from API/worker results — **never hard-coded.** Show an "Environment" box (browser/UA, CPU cores, OS, library versions).

A neutral "Observations" panel may generate text *from the data* (e.g., "Smallest signature: Falcon-512 (≈ X bytes)") — phrase as trade-offs, not absolute rankings.

### 5.10 Algorithms
Reference page: table of supported KEMs/SIGs with NIST security level, sizes, standard (FIPS 203 ML-KEM, FIPS 204 ML-DSA, FIPS 205 SLH-DSA; Falcon is selected by NIST for standardization as FN-DSA, draft status — display "status" field from backend, don't hard-code claims).

### 5.11 About / Security Model
Diagrams (SVG/Mermaid) of upload and download flows from the project description, the threat model (untrusted server), and what the server can/cannot see. Include a "what happens if the server is compromised" section.

---

## 6. State, Errors, Feedback

- API errors mapped to user-friendly toasts; crypto failures use dedicated, explicit messages:
  - `INTEGRITY_FAILED` — "The stored file was modified. Do not trust it."
  - `SIGNATURE_INVALID` — "This file was not signed by its claimed owner."
  - `DECRYPT_FAILED` — wrong key or corrupted data.
  - `VAULT_LOCKED` — prompt to unlock.
  - `ALG_UNSUPPORTED` — algorithm not available in this browser.
- Global loading and empty states; skeleton loaders.
- Retry/resume for failed uploads (re-upload from scratch is acceptable; chunk-level resume is a stretch goal).

---

## 7. Security Requirements for the Frontend

- Content-Security-Policy: no inline scripts, `connect-src` limited to the API origin (+ `wasm-unsafe-eval` only if WASM requires it).
- No secrets in `localStorage`/`sessionStorage`; JWT kept in memory.
- No third-party analytics/trackers.
- Dependencies pinned; run `npm audit` in CI. Use Subresource Integrity if any CDN is used (prefer none).
- Sanitize all rendered filenames/metadata (no `dangerouslySetInnerHTML`).
- Use `crypto.getRandomValues` for all randomness.
- Clear sensitive buffers when possible; documented JS limitation: memory zeroization is best-effort.
- Warn if page is not served over HTTPS (except localhost).

---

## 8. Performance Requirements

- All crypto in Web Workers; UI stays responsive.
- Chunked streaming for files (never read a whole 1 GB file into memory when avoidable).
- Code-split pages; lazy-load WASM and chart bundles.
- Show estimated time remaining for large operations.

---

## 9. Testing Requirements

- **Unit (Vitest):** providers roundtrip, AES chunking, nonce/AAD construction, HKDF, canonical JSON against shared vectors, vault lock/unlock.
- **Component tests:** upload stepper states, integrity badges, unlock dialog.
- **E2E (Playwright, against dockerized backend):** register → login → upload → list → verify → download → byte-compare with original; tamper scenario (modify stored blob) → download blocked with tamper warning; wrong passphrase; key export/import on a fresh browser profile.
- **Cross-compat test:** a file uploaded with the Python client (see `03_INTEGRATIONS.md`) must be downloadable/decryptable in the browser and vice versa.

---

## 10. Deliverables Checklist

- [ ] Vite + React + TS app implementing all pages above
- [ ] Crypto provider layer with Noble + Falcon (WASM or agent fallback) behind common interface
- [ ] Upload & download pipelines with stage progress and timings
- [ ] Encrypted key vault with export/import
- [ ] Benchmarks UI with ≥ 6 charts, CSV/JSON export, compare view
- [ ] Shared test vectors passing in CI
- [ ] `README.md` (setup, env vars: `VITE_API_URL`, build, test)
- [ ] Dockerfile / nginx config serving the production build with CSP headers