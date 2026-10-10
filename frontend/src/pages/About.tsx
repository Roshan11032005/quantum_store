/**
 * About.tsx — Detailed project overview, protocol, and security model.
 */

export default function About() {
  return (
    <div className="space-y-10 max-w-4xl">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary/5 to-primary/0 border border-primary/20 rounded-2xl p-8">
        <div className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full mb-4 uppercase tracking-wider">
          Research Project
        </div>
        <h1 className="text-3xl font-bold leading-tight">
          QuantumStore
        </h1>
        <p className="text-lg text-muted-foreground mt-2 font-medium">
          Design and Performance Evaluation of a Secure Outsourced Storage System
          Using NIST Post-Quantum Cryptographic Algorithms
        </p>
        <p className="text-sm text-muted-foreground mt-4 leading-relaxed max-w-2xl">
          A zero-knowledge cloud storage system where all cryptographic operations — encryption, decryption,
          key generation, and signing — happen entirely inside your browser using FIPS-standardised
          post-quantum algorithms. The server is treated as fully untrusted: it stores only ciphertext and
          can never access your plaintext or secret keys.
        </p>
      </div>

      {/* Core principle */}
      <Section title="Core Principle">
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong>Plaintext files and secret keys never leave the browser.</strong> All encryption, decryption,
          key generation, and signature operations happen locally in your browser using the Web Crypto API
          and WebAssembly. The server only ever receives ciphertext, wrapped key material, and public keys.
        </p>
      </Section>

      {/* System Architecture */}
      <Section title="System Architecture" subtitle="How the components fit together">
        <div className="bg-secondary/40 rounded-xl p-5 font-mono text-xs leading-relaxed overflow-x-auto text-muted-foreground mb-5">
          <pre>{`
  ┌────────────────────────────────────────────────────────┐
  │              BROWSER  (Trusted Zone)                   │
  │                                                        │
  │  ┌──────────────┐   ┌────────────────────────────┐    │
  │  │  Key Vault   │   │     Crypto Workers         │    │
  │  │  (Argon2id)  │   │  ┌──────────┬──────────┐   │    │
  │  │  AES-GCM     │   │  │ ML-KEM   │ ML-DSA   │   │    │
  │  │  encrypted   │   │  │ ML-KEM   │ Falcon   │   │    │
  │  │  at rest     │   │  │ encaps / │ SLH-DSA  │   │    │
  │  └──────┬───────┘   │  │ decaps   │ sign /   │   │    │
  │         │           │  └──────────┴─verify───┘   │    │
  │         └───────────►  AES-256-GCM chunks         │    │
  │                        HKDF-SHA256 for KEK         │    │
  └───────────────────────────┬────────────────────────┘
                              │  ciphertext + wrapped keys
                              │  + signature (NEVER plaintext)
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │              NGINX Gateway  (port 80)                  │
  │  Serves SPA + reverse-proxies /api → FastAPI           │
  └───────────────────────────┬────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ FastAPI  │   │PostgreSQL│   │  MinIO   │
        │ backend  │   │ metadata │   │ object   │
        │ liboqs   │   │ + keys   │   │ store    │
        │ (verify) │   │ + audit  │   │(S3-compat│
        └──────────┘   └──────────┘   └──────────┘

  The backend CANNOT read your files. It only stores &
  verifies. Secret keys never cross the browser boundary.
`}</pre>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <InfoBox icon="🔐" title="Browser (Trusted)" body="All crypto runs here. Keys generated, encryption and signing done in Web Workers. Vault locked with Argon2id + AES-256-GCM." />
          <InfoBox icon="🛡️" title="Gateway (Nginx)" body="Single public port (80). Serves the React SPA and reverse-proxies API calls — same origin eliminates CORS." />
          <InfoBox icon="🗄️" title="Backend (Untrusted)" body="FastAPI + PostgreSQL + MinIO. Stores ciphertext and metadata. Verifies signatures with liboqs. Never sees plaintext." />
        </div>
      </Section>

      {/* Key Vault */}
      <Section title="Key Vault" subtitle="How your secret keys are protected at rest">
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          When you register, the browser generates a <strong>KEM keypair</strong> (e.g. ML-KEM-768) and a
          <strong> signature keypair</strong> (e.g. ML-DSA-65). These are never sent to the server in plain form.
          Instead they are encrypted into a key vault using a passphrase:
        </p>
        <ol className="space-y-3 text-sm mb-5">
          {[
            { label: 'Argon2id KDF', desc: 'Your passphrase is stretched with Argon2id (memory=64 MiB, time=3, parallelism=1) using a random 32-byte salt. This makes brute-force expensive even with dedicated hardware.' },
            { label: 'AES-256-GCM encryption', desc: 'The derived 32-byte vault key encrypts all secret keys (kem_sk, sig_sk, kem_pk, sig_pk) as a single JSON payload using AES-256-GCM with a random 12-byte nonce.' },
            { label: 'Public fingerprints', desc: 'SHA-256 fingerprints of your public keys are stored in cleartext in the vault header and on the server so the correct public key can be fetched without decrypting the vault.' },
            { label: 'Memory-only unlock', desc: 'When you unlock the vault, secret keys are held in a JavaScript Uint8Array — never written to localStorage, sessionStorage, or disk. The vault auto-locks after 10 minutes of inactivity or on tab hide.' },
          ].map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <div><span className="font-medium">{s.label} — </span><span className="text-muted-foreground">{s.desc}</span></div>
            </li>
          ))}
        </ol>
        <CodeBlock>{`// Vault JSON structure (stored in browser IndexedDB)
{
  "format": "pqckey",  "version": 1,
  "kdf": { "alg": "argon2id", "salt": "<b64url>",
           "time_cost": 3, "memory_kib": 65536 },
  "cipher": { "alg": "AES-256-GCM", "nonce": "<b64url>" },
  "ciphertext": "<b64url of AES-GCM(kem_sk + sig_sk + ...)>",
  "public": { "kem_alg": "ML-KEM-768", "kem_pk_fp": "<hex>",
               "sig_alg": "ML-DSA-65",  "sig_pk_fp": "<hex>" }
}`}</CodeBlock>
      </Section>

      {/* Upload flow */}
      <Section title="Upload Protocol — Step by Step" subtitle="What happens when you click 'Upload'">
        <ol className="space-y-4 text-sm">
          {[
            {
              label: 'Generate file_id + DEK',
              desc: 'A random UUID (file_id) and a 32-byte Data Encryption Key (DEK) are generated in the browser using crypto.getRandomValues(). Neither is ever sent to the server in plaintext.',
              code: 'const fileId = uuidv4();\nconst dek = randomBytes(32); // Web Crypto'
            },
            {
              label: 'Chunk encrypt with AES-256-GCM',
              desc: 'The file is split into 4 MiB chunks. Each chunk is encrypted with AES-256-GCM. The nonce is base_nonce(8 B) ‖ uint32_be(chunk_index). The AAD binds each chunk to its position, chunk count, file_id, and a final-chunk flag — preventing reordering attacks.',
              code: 'nonce = base_nonce(8B) ‖ uint32_be(index)\nAAD   = file_id(16B) ‖ uint32_be(index)\n      ‖ uint32_be(chunk_count) ‖ final_flag(1B)'
            },
            {
              label: 'KEM Encapsulate',
              desc: 'Your ML-KEM public key is used to encapsulate a random shared secret. This produces a KEM ciphertext and a shared secret. The shared secret is used to derive the Key Encryption Key (KEK) — never stored directly.',
              code: '{ ciphertext, sharedSecret } = ml_kem768.encapsulate(kemPublicKey)'
            },
            {
              label: 'Derive KEK with HKDF-SHA256',
              desc: 'The KEK is deterministically derived from the shared secret and file_id using HKDF-SHA256 with the domain-separation label "pqc-storage-kek-v1". This ensures each file uses a unique KEK even if two files share the same uploader.',
              code: 'kek = HKDF-SHA256(ikm=sharedSecret, salt=file_id,\n                  info="pqc-storage-kek-v1")'
            },
            {
              label: 'Wrap DEK → zeroize all secrets',
              desc: 'The DEK is wrapped (encrypted) with the KEK using AES-256-GCM with a random 12-byte nonce (wrap_nonce). After wrapping, the DEK, KEK, and shared secret are all zeroized (overwritten with zeroes) in memory.',
              code: 'wrappedDek = AES-GCM-Encrypt(key=kek, plaintext=dek,\n                             nonce=wrap_nonce)\nzeroize(dek, kek, sharedSecret)'
            },
            {
              label: 'Build canonical metadata + sign',
              desc: 'A canonical JSON object is built with all file metadata (file_id, hashes, algorithm names, timestamps…). It is serialized with deterministic key ordering, then SHA-256 hashed. The 32-byte hash is signed with your signature secret key (ML-DSA / Falcon / SLH-DSA). The server verifies this signature on download.',
              code: 'metadataBytes = canonicalJson(metadata)   // sorted keys\nhash = SHA-256(metadataBytes)\nsignature = sig_sk.sign(hash)              // 32 bytes signed'
            },
            {
              label: 'POST multipart upload',
              desc: 'A single multipart/form-data request sends: ciphertext blob, canonical metadata JSON, KEM ciphertext, wrapped DEK, and the metadata signature. The backend stores everything and verifies the signature.',
              code: 'POST /api/v1/files\n  ciphertext   (binary)\n  metadata     (JSON string)\n  kem_ct       (base64url)\n  wrapped_dek  (base64url)\n  signature    (base64url)'
            },
          ].map((step, i) => (
            <li key={i} className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-start gap-3 p-4">
                <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{step.label}</p>
                  <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{step.desc}</p>
                </div>
              </div>
              <CodeBlock>{step.code}</CodeBlock>
            </li>
          ))}
        </ol>
      </Section>

      {/* Download flow */}
      <Section title="Download Protocol — Step by Step" subtitle="What happens when you click 'Download & Decrypt'">
        <ol className="space-y-4 text-sm">
          {[
            {
              label: 'Fetch ciphertext + metadata from server',
              desc: 'The API returns the metadata JSON (including KEM ciphertext, wrapped DEK, signature) and the raw ciphertext blob. The backend logs the access in the audit log.',
              code: 'GET /api/v1/files/{id}          // metadata\nGET /api/v1/files/{id}/content  // ciphertext bytes'
            },
            {
              label: 'Verify ciphertext integrity (SHA-256)',
              desc: 'The browser computes SHA-256 of the downloaded ciphertext and compares it to the stored hash in the metadata. Any bit-flip introduced by a storage-level attacker will be caught here before decryption is attempted.',
              code: 'computed = SHA-256(ciphertextBytes)\nif computed ≠ metadata.ciphertext_sha256:\n  throw INTEGRITY_FAILED'
            },
            {
              label: 'Verify metadata signature',
              desc: 'The canonical metadata JSON (excluding the two merge-only fields kem_ciphertext and wrapped_dek) is hashed and the signature is verified against the uploader\'s public signature key fetched from the server. This proves the metadata was created by the claimed owner and hasn\'t been tampered with.',
              code: 'hash = SHA-256(canonicalJson(metadata))\nvalid = sig_pk.verify(hash, signature)\nif !valid: throw SIGNATURE_INVALID'
            },
            {
              label: 'KEM Decapsulate → shared secret',
              desc: 'Your ML-KEM secret key decapsulates the stored KEM ciphertext, recovering the same shared secret that was generated at upload time. No network round-trip is needed.',
              code: 'sharedSecret = ml_kem768.decapsulate(kemSecretKey,\n                                    kemCiphertext)'
            },
            {
              label: 'Derive KEK → unwrap DEK',
              desc: 'HKDF-SHA256 is run with the same salt (file_id) and label to reproduce the KEK. The wrapped DEK is then decrypted with AES-256-GCM using the stored wrap_nonce.',
              code: 'kek = HKDF-SHA256(ikm=sharedSecret, salt=file_id,\n                  info="pqc-storage-kek-v1")\ndek = AES-GCM-Decrypt(key=kek, ciphertext=wrappedDek,\n                      nonce=wrap_nonce)\nzeroize(kek, sharedSecret)'
            },
            {
              label: 'Decrypt chunks + verify AAD',
              desc: 'Each 4 MiB chunk is decrypted in sequence. AES-GCM authentication verifies the AAD (file_id, index, count, final flag) on every chunk — detecting any reordering, truncation, or substitution. If any chunk fails, decryption aborts and no plaintext is returned.',
              code: 'for each chunk i:\n  plaintext[i] = AES-GCM-Decrypt(\n    key=dek, nonce=buildNonce(base_nonce, i),\n    aad=buildAAD(file_id, i, count, isFinal))\nzeroize(dek)'
            },
          ].map((step, i) => (
            <li key={i} className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-start gap-3 p-4">
                <span className="w-7 h-7 rounded-full bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{step.label}</p>
                  <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{step.desc}</p>
                </div>
              </div>
              <CodeBlock>{step.code}</CodeBlock>
            </li>
          ))}
        </ol>
      </Section>

      {/* Authentication */}
      <Section title="Post-Quantum Authentication (Login)" subtitle="Challenge-response using your signature keypair — no passwords sent to the server">
        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed mb-4">
          <p>
            Login does not use a traditional password. Instead it uses a <strong>post-quantum challenge-response</strong> protocol:
          </p>
        </div>
        <ol className="space-y-3 text-sm mb-4">
          {[
            { step: 'POST /auth/challenge', desc: 'Browser sends your username. Server creates a random 32-byte nonce, stores it with a 60-second expiry, and returns it.' },
            { step: 'Sign the challenge', desc: 'Browser unlocks the vault, reconstructs the domain-separated message "pqc-storage-login-v1" ‖ username ‖ nonce, and signs it with your signature secret key (e.g. ML-DSA-65).' },
            { step: 'POST /auth/verify', desc: 'Browser sends the challenge_id and the base64url signature. Server fetches your public key from the DB, verifies the signature with liboqs, and issues a short-lived JWT (HS256, 15-minute expiry) on success.' },
            { step: 'In-memory JWT', desc: 'The JWT is held only in JavaScript memory — never written to localStorage or cookies — so it disappears on page reload or tab close.' },
          ].map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <div><code className="text-xs bg-secondary px-1.5 py-0.5 rounded font-mono mr-2">{s.step}</code><span className="text-muted-foreground">{s.desc}</span></div>
            </li>
          ))}
        </ol>
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300">
          <strong>Note:</strong> The session JWT itself uses HS256 (classical). Post-quantum JWT signatures are not yet standardised. The PQ guarantee is on the <em>authentication handshake</em> — proving you hold the secret signing key without ever revealing it.
        </div>
      </Section>

      {/* Threat model */}
      <Section title="Threat Model" subtitle="What attackers can and cannot do">
        <div className="space-y-3 text-sm mb-4">
          {[
            { threat: 'Fully compromised server', icon: '☠️', response: 'Attacker gains: ciphertext blobs, KEM ciphertexts, wrapped DEKs, public keys, signatures, file sizes, upload timestamps. Cannot gain: plaintext, DEKs, your KEM or signature secret keys (never leave the browser).' },
            { threat: 'Network eavesdropper (passive)', icon: '👁️', response: 'All API calls go over the same-origin HTTPS termination. The browser never sends plaintext. ML-KEM provides IND-CCA2 security under the Module-LWE hardness assumption, believed resistant to quantum computers.' },
            { threat: 'Storage-layer tampering', icon: '✏️', response: 'An attacker who flips bits in the stored ciphertext will be detected on download by the AES-GCM authentication tag failure and the SHA-256 ciphertext hash mismatch. Tampering is caught before any plaintext is produced.' },
            { threat: 'Metadata tampering', icon: '📝', response: 'All metadata is signed with the owner\'s post-quantum signature key. Any modification breaks the signature check → SIGNATURE_INVALID abort.' },
            { threat: 'Harvest-now, decrypt-later (quantum threat)', icon: '⚛️', response: 'ML-KEM-768 (NIST security level 3) is designed to be secure against adversaries with a cryptographically relevant quantum computer. Encrypted files stored today remain secure after a quantum breakthrough.' },
            { threat: 'Weak passphrase brute-force', icon: '🔑', response: 'The vault key is derived with Argon2id (64 MiB RAM, 3 iterations). A wrong passphrase costs ≥64 MiB of memory per attempt — making GPU/ASIC attacks impractical at scale.' },
            { threat: 'XSS injection', icon: '💉', response: 'Strict Content-Security-Policy blocks inline scripts and external origins. No dangerouslySetInnerHTML. Filenames sanitized before DOM insertion. JWT stored in memory only — not accessible to injected scripts via localStorage.' },
            { threat: 'Server-side signature forgery', icon: '🔏', response: 'Forge a valid ML-DSA / Falcon / SLH-DSA signature without the user\'s secret key → equivalent to breaking the underlying lattice/hash hardness problem, believed infeasible classically and quantum-mechanically.' },
          ].map((r) => (
            <div key={r.threat} className="flex gap-3 p-4 bg-card border border-border rounded-lg">
              <span className="text-xl flex-shrink-0">{r.icon}</span>
              <div>
                <p className="font-semibold text-sm">{r.threat}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.response}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Algorithm deep dive */}
      <Section title="Post-Quantum Algorithms" subtitle="NIST-standardised algorithms used in this system">
        <div className="space-y-3 mb-6">
          {[
            {
              std: 'FIPS 203', name: 'ML-KEM', full: 'Module-Lattice Key Encapsulation Mechanism',
              role: 'Key encapsulation — protects the file encryption key.',
              how: 'Based on the hardness of the Module Learning With Errors (MLWE) problem. Encapsulation generates a random shared secret + KEM ciphertext using the recipient\'s public key. Decapsulation recovers the shared secret using the secret key. IND-CCA2 secure.',
              variants: ['ML-KEM-512 (Level 1)', 'ML-KEM-768 (Level 3, default)', 'ML-KEM-1024 (Level 5)'],
              sizes: 'PK: 1184 B · SK: 2400 B · CT: 1088 B (ML-KEM-768)',
              color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/10',
            },
            {
              std: 'FIPS 204', name: 'ML-DSA', full: 'Module-Lattice Digital Signature Algorithm',
              role: 'Digital signatures — authenticates file metadata and login challenges.',
              how: 'Based on MLWE and Module Short Integer Solution (MSIS). Signs a 32-byte hash of the canonical metadata JSON. The signature proves the file was created by the holder of the secret key and has not been modified.',
              variants: ['ML-DSA-44 (Level 2)', 'ML-DSA-65 (Level 3, default)', 'ML-DSA-87 (Level 5)'],
              sizes: 'PK: 1952 B · SK: 4032 B · Sig: 3309 B (ML-DSA-65)',
              color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/10',
            },
            {
              std: 'FIPS 205', name: 'SLH-DSA', full: 'Stateless Hash-Based Digital Signature Standard',
              role: 'Hash-based signature fallback — security relies only on hash function properties.',
              how: 'SPHINCS+ family. Uses a hypertree of FORS and WOTS+ one-time signatures. No lattice assumptions — security reduces purely to SHA-2/SHA-3 preimage and collision resistance. Much larger signatures but conservative security foundation.',
              variants: ['SLH-DSA-SHA2-128f (fast variant)', 'SLH-DSA-SHA2-128s (small variant)'],
              sizes: 'PK: 32 B · SK: 64 B · Sig: 17,088 B (SHA2-128f)',
              color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/10',
            },
            {
              std: 'Draft FN-DSA', name: 'Falcon', full: 'Fast Fourier Lattice-Based Compact Signatures',
              role: 'Compact signature option — smallest signatures of any PQ scheme.',
              how: 'NTRU lattice-based. Uses Gaussian sampling over NTRU lattices. Produces the smallest signatures among NIST PQ candidates. Requires careful floating-point arithmetic — implemented via liboqs (server) and liboqs-wasm (browser, optional).',
              variants: ['Falcon-512 (Level 1)', 'Falcon-1024 (Level 5)'],
              sizes: 'PK: 897 B · SK: 1281 B · Sig: ~666 B (Falcon-512, variable)',
              color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/10',
            },
          ].map((alg) => (
            <div key={alg.std} className={`border border-border rounded-xl overflow-hidden`}>
              <div className={`flex items-center gap-3 px-4 py-3 ${alg.bg}`}>
                <code className={`font-mono text-xs font-bold ${alg.color}`}>{alg.std}</code>
                <span className="font-semibold">{alg.name}</span>
                <span className="text-xs text-muted-foreground hidden sm:block">— {alg.full}</span>
              </div>
              <div className="p-4 space-y-2 text-sm">
                <p><span className="font-medium">Role: </span><span className="text-muted-foreground">{alg.role}</span></p>
                <p><span className="font-medium">How it works: </span><span className="text-muted-foreground">{alg.how}</span></p>
                <p><span className="font-medium">Variants: </span><span className="text-muted-foreground">{alg.variants.join(', ')}</span></p>
                <p><span className="font-medium">Key sizes: </span><code className="text-xs bg-secondary px-1.5 py-0.5 rounded">{alg.sizes}</code></p>
              </div>
            </div>
          ))}
        </div>

        {/* Classical primitives */}
        <h3 className="font-semibold text-sm mb-3">Classical Primitives</h3>
        <div className="space-y-2 text-sm">
          {[
            { std: 'NIST SP 800-38D', name: 'AES-256-GCM', desc: 'Authenticated encryption for file chunks and vault encryption. GCM mode provides both confidentiality and integrity. 128-bit authentication tag per chunk.' },
            { std: 'RFC 5869', name: 'HKDF-SHA256', desc: 'Key derivation. Derives the 32-byte KEK from the KEM shared secret using the file_id as salt and "pqc-storage-kek-v1" as domain separator.' },
            { std: 'RFC 9106', name: 'Argon2id', desc: 'Memory-hard password hashing for vault key derivation. 64 MiB RAM, 3 time iterations, parallelism=1. Resistant to GPU and ASIC brute-force.' },
            { std: 'FIPS 180-4', name: 'SHA-256', desc: 'Used for: ciphertext integrity hash, metadata pre-hash before signing, public key fingerprints, HKDF internal hash.' },
          ].map((r) => (
            <div key={r.std} className="flex gap-4 p-3 bg-secondary/30 rounded-lg">
              <code className="font-mono text-xs text-primary w-36 flex-shrink-0 pt-0.5">{r.std}</code>
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Implementation details */}
      <Section title="Implementation Details" subtitle="Libraries, runtime environments, and code structure">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-5">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="font-semibold mb-3 text-primary">Browser (TypeScript + React)</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li><code className="bg-secondary px-1 rounded">@noble/post-quantum</code> — ML-KEM, ML-DSA, SLH-DSA</li>
              <li><code className="bg-secondary px-1 rounded">Web Crypto API</code> — AES-256-GCM, HKDF, SHA-256</li>
              <li><code className="bg-secondary px-1 rounded">hash-wasm</code> — Argon2id for vault KDF</li>
              <li><code className="bg-secondary px-1 rounded">liboqs-wasm</code> — Falcon (optional, fallback)</li>
              <li><code className="bg-secondary px-1 rounded">Comlink</code> — Web Workers for crypto off main thread</li>
              <li><code className="bg-secondary px-1 rounded">Zustand</code> — auth + vault state management</li>
              <li><code className="bg-secondary px-1 rounded">Vite + React 18</code> — build toolchain</li>
            </ul>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="font-semibold mb-3 text-primary">Backend (Python + FastAPI)</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li><code className="bg-secondary px-1 rounded">liboqs-python</code> — All PQ algorithms for verify+bench</li>
              <li><code className="bg-secondary px-1 rounded">FastAPI + uvicorn</code> — async REST API</li>
              <li><code className="bg-secondary px-1 rounded">SQLAlchemy 2 async</code> — PostgreSQL via asyncpg</li>
              <li><code className="bg-secondary px-1 rounded">Alembic</code> — database migrations</li>
              <li><code className="bg-secondary px-1 rounded">boto3 / MinIO</code> — S3-compatible object storage</li>
              <li><code className="bg-secondary px-1 rounded">PyJWT (HS256)</code> — short-lived session tokens</li>
              <li><code className="bg-secondary px-1 rounded">cryptography</code> — AES-GCM for benchmark suite</li>
            </ul>
          </div>
        </div>
        <div className="bg-secondary/30 rounded-xl p-4 text-xs font-mono text-muted-foreground overflow-x-auto">
          <p className="font-sans font-semibold text-sm text-foreground mb-2">Crypto pipeline (browser)</p>
          <pre>{`File → AES-256-GCM chunks (Web Crypto, Web Worker)
     ↓
ML-KEM encapsulate → shared_secret (noble/post-quantum)
     ↓
HKDF-SHA256(shared_secret, file_id) → KEK (Web Crypto)
     ↓
AES-256-GCM wrap DEK → wrapped_dek   (Web Crypto)
     ↓
SHA-256(canonical_json(metadata)) → hash  (Web Crypto)
     ↓
ML-DSA sign(hash) → signature           (noble/post-quantum)
     ↓
POST /api/v1/files  {ciphertext, metadata, sig, kem_ct, wrapped_dek}`}</pre>
        </div>
      </Section>

      {/* Benchmarking */}
      <Section title="Performance Benchmarking" subtitle="Comparing browser (JavaScript) vs server (native liboqs) performance">
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          The benchmark module measures the real-world performance of each algorithm in both environments.
          This is central to the research: understanding the cost of post-quantum cryptography in
          constrained (browser) environments versus native code.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-4">
          <InfoBox icon="🌐" title="Browser benchmarks"
            body="Run in a Web Worker via Comlink. Uses @noble/post-quantum (pure JS/WASM). Measures realistic browser KEM + signature performance. Limited to 32-byte messages (matching real protocol: signing a SHA-256 hash)." />
          <InfoBox icon="⚙️" title="Server benchmarks"
            body="Run by the FastAPI backend via liboqs-python (native C library). Measures KEM keygen/encaps/decaps and SIG keygen/sign/verify across 32B, 1KB, and 1MB messages. Results stored in PostgreSQL." />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Results include mean, median, standard deviation, P95, min, and max timings. The Compare page lets you
          load two runs side-by-side to see the browser vs. server performance gap for each algorithm.
        </p>
      </Section>

      {/* What the server knows */}
      <Section title="Information Available to the Server">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-xl p-4">
            <p className="font-semibold text-red-700 dark:text-red-400 mb-3">✓ Server CAN see</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>• Ciphertext blobs (not decryptable)</li>
              <li>• KEM ciphertexts (not decryptable without your SK)</li>
              <li>• Wrapped DEKs (not decryptable without KEK)</li>
              <li>• Metadata signatures (not forgeable)</li>
              <li>• Your public keys (public by design)</li>
              <li>• File sizes and upload/access timestamps</li>
              <li>• Username (not the passphrase)</li>
            </ul>
          </div>
          <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 rounded-xl p-4">
            <p className="font-semibold text-green-700 dark:text-green-400 mb-3">✗ Server CANNOT see</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>• File plaintext (ever)</li>
              <li>• Data Encryption Keys (DEKs)</li>
              <li>• Key Encryption Keys (KEKs)</li>
              <li>• KEM shared secrets</li>
              <li>• Your signature secret key</li>
              <li>• Your KEM secret key</li>
              <li>• Your vault passphrase</li>
              <li>• Original filenames (if hidden)</li>
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4 pb-2 border-b border-border">
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function InfoBox({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <p className="font-semibold text-sm">{title}</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="bg-secondary/60 border-t border-border px-4 py-3 font-mono text-xs text-muted-foreground overflow-x-auto whitespace-pre">
      {children}
    </div>
  );
}
