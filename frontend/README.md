# QuantumStore — Frontend

> A quantum-resistant cloud storage system using NIST post-quantum cryptographic algorithms (FIPS 203, FIPS 204, FIPS 205).

## Overview

All encryption, signing, and key generation happens **in the browser**. Plaintext files and secret keys never leave your device. The backend is treated as untrusted.

- **KEM:** ML-KEM-512/768/1024 (FIPS 203) — key encapsulation
- **Signatures:** ML-DSA-44/65/87 (FIPS 204), SLH-DSA-SHA2-128f (FIPS 205), Falcon-512/1024
- **Symmetric:** AES-256-GCM (Web Crypto API) — chunked file encryption
- **KDF:** HKDF-SHA256 for KEK derivation, Argon2id for vault key derivation

---

## Prerequisites

- Node.js ≥ 20
- npm ≥ 10

---

## Setup

```bash
cd frontend
npm install
```

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | Backend API base URL | `http://localhost:8000/api/v1` |
| `VITE_AGENT_URL` | Local Falcon agent base URL (fallback only) | `http://localhost:8765` |

Create a `.env.local` file:

```env
VITE_API_URL=http://localhost:8000/api/v1
VITE_AGENT_URL=http://localhost:8765
```

---

## Development

```bash
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173).

---

## Build

```bash
npm run build
```

Output in `dist/`.

---

## Testing

### Unit tests (Vitest)

```bash
npm test
```

Tests cover:
- `canonicalJson` against shared vectors in `tests/vectors/canonical.json`
- AES-256-GCM chunk encryption/decryption roundtrip
- HKDF-SHA256 determinism and domain separation
- ML-KEM-768 encapsulate/decapsulate roundtrip
- ML-DSA-65 sign/verify roundtrip
- SLH-DSA roundtrip
- Base64url and hex encoding

### E2E tests (Playwright)

```bash
npm run test:e2e
```

Requires the dev server to be running: `npm run dev`

---

## Docker / Nginx

```bash
# Build production image
docker build -t quantum-store-frontend .

# Run on port 80
docker run -p 80:80 quantum-store-frontend
```

---

## Project Structure

```
src/
├── api/            # HTTP layer (fetch wrapper, endpoints)
├── crypto/         # PQ crypto — interfaces, providers, protocol
│   ├── providers/  # noble.ts, oqsWasm.ts, agent.ts
│   └── workers/    # crypto.worker.ts, bench.worker.ts
├── store/          # Zustand stores (auth, vault)
├── pages/          # Route pages
├── components/     # UI components
├── hooks/          # React hooks
├── utils/          # cn, format helpers
└── types/          # Shared TS types
tests/
├── vectors/        # Shared canonical JSON test vectors
├── e2e/            # Playwright E2E tests
└── *.test.ts       # Vitest unit tests
```

---

## Security Notes

- **No secrets in localStorage/sessionStorage.** JWTs are kept in memory only.
- **Vault auto-locks** after 10 minutes of idle (configurable) and on tab hide.
- **CSP** configured in Vite dev server and Nginx production config.
- **`crypto.getRandomValues`** used for all randomness — never `Math.random()`.
- **Secret key zeroization** is best-effort in JavaScript (GC prevents guarantees).
- Serve over **HTTPS** in production. The app warns if served over plain HTTP.

---

## License

Research project — see repository root for license information.
