/**
 * About.tsx — Security model, protocol diagrams, threat model.
 */

export default function About() {
  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">About & Security Model</h1>
        <p className="text-muted-foreground mt-2">
          Design and Performance Evaluation of a Secure Outsourced Storage System
          Using NIST Post-Quantum Cryptographic Algorithms.
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

      {/* Upload flow */}
      <Section title="Upload Protocol">
        <ol className="space-y-3 text-sm">
          {[
            'Generate a random 32-byte Data Encryption Key (DEK) and UUID file_id in the browser.',
            'Encrypt the file in 4 MiB chunks using AES-256-GCM. Each chunk uses a nonce derived as base_nonce (8 bytes) ‖ uint32_be(chunk_index). AAD includes file_id, chunk index, chunk count, and final-flag.',
            'KEM Encapsulate using your ML-KEM public key → obtain ciphertext + shared secret.',
            'Derive KEK = HKDF-SHA256(shared_secret, salt=file_id, info="pqc-storage-kek-v1").',
            'Wrap DEK with KEK using AES-256-GCM → wrapped_dek. Zeroize DEK, KEK, shared_secret.',
            'Build canonical JSON metadata (file_id, hash, wrapped_dek, KEM ciphertext, …). Hash it with SHA-256. Sign the hash with your signature key (ML-DSA / Falcon / SLH-DSA).',
            'POST multipart upload: ciphertext + metadata + signature. The server never sees the plaintext.',
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <p className="text-muted-foreground">{step}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Download flow */}
      <Section title="Download Protocol">
        <ol className="space-y-3 text-sm">
          {[
            'Fetch ciphertext and metadata signature from server.',
            'Verify ciphertext SHA-256 hash against stored value. Abort if mismatch → INTEGRITY_FAILED.',
            'Verify metadata signature using the owner\'s public signature key. Abort if invalid → SIGNATURE_INVALID.',
            'KEM Decapsulate using your ML-KEM secret key → shared secret.',
            'Derive KEK = HKDF-SHA256(shared_secret, salt=file_id, info="pqc-storage-kek-v1").',
            'Unwrap DEK using KEK. Zeroize KEK and shared_secret.',
            'Decrypt each AES-256-GCM chunk in sequence. Verify AAD on each chunk. Zeroize DEK.',
            'Deliver plaintext to user. Abort if any chunk fails.',
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <p className="text-muted-foreground">{step}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Threat model */}
      <Section title="Threat Model">
        <div className="space-y-4 text-sm">
          <ThreatRow threat="Compromised server" response="Server only stores ciphertext. Cannot decrypt without the user's secret KEM key." />
          <ThreatRow threat="Network attacker (passive)" response="All transmitted data is ciphertext. Post-quantum KEM ensures forward secrecy against quantum adversaries." />
          <ThreatRow threat="File tampering" response="AES-GCM authentication tags + SHA-256 hash + signature — any modification is detected on download." />
          <ThreatRow threat="Signature forgery" response="ML-DSA / Falcon / SLH-DSA are NIST-standardized post-quantum signatures, secure against quantum attackers." />
          <ThreatRow threat="Harvest-now decrypt-later" response="ML-KEM provides IND-CCA2 security under the MLWE assumption, resistant to quantum computers." />
          <ThreatRow threat="Weak passphrase (vault)" response="Argon2id key derivation (memory-hard) mitigates brute force. User is warned about passphrase strength." />
          <ThreatRow threat="XSS attack" response="CSP prevents inline scripts. No dangerouslySetInnerHTML. Filenames are sanitized." />
        </div>
      </Section>

      {/* What if the server is compromised? */}
      <Section title="What Happens If the Server Is Compromised?">
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>An attacker with full server access can see:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Ciphertext blobs (not plaintext — AES-256-GCM)</li>
            <li>KEM ciphertexts (useless without your secret KEM key)</li>
            <li>Wrapped DEKs (encrypted with a key derived from the KEM shared secret)</li>
            <li>Metadata signatures (cannot forge without your secret signing key)</li>
            <li>Public keys (these are public by design)</li>
            <li>File sizes and upload timestamps</li>
          </ul>
          <p className="mt-3">An attacker <strong>cannot</strong> see:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>File plaintext</li>
            <li>Data Encryption Keys</li>
            <li>Your KEM or signature secret keys (these never leave your browser)</li>
          </ul>
          <p className="mt-3">
            An attacker can <strong>tamper</strong> with stored ciphertext, but tampering will be detected
            when you download: the SHA-256 hash will mismatch and the AES-GCM tag will fail authentication.
          </p>
        </div>
      </Section>

      {/* Algorithms */}
      <Section title="Cryptographic Standards">
        <div className="space-y-2 text-sm">
          {[
            { std: 'FIPS 203', name: 'ML-KEM', desc: 'Module-Lattice-Based Key-Encapsulation Mechanism (Kyber). Used for key encapsulation.' },
            { std: 'FIPS 204', name: 'ML-DSA', desc: 'Module-Lattice-Based Digital Signature Algorithm (Dilithium). Used for file signing.' },
            { std: 'FIPS 205', name: 'SLH-DSA', desc: 'Stateless Hash-Based Digital Signature Standard (SPHINCS+). Hash-based fallback.' },
            { std: 'Draft FN-DSA', name: 'Falcon', desc: 'NTRU lattice-based. Smallest signatures. Selected by NIST; standardization in progress.' },
            { std: 'RFC 9106', name: 'Argon2id', desc: 'Memory-hard password hashing. Used to protect the key vault at rest.' },
            { std: 'NIST SP 800-38D', name: 'AES-256-GCM', desc: 'Authenticated encryption for file chunks. Tag provides integrity.' },
            { std: 'RFC 5869', name: 'HKDF-SHA256', desc: 'Key derivation to derive KEK from KEM shared secret.' },
          ].map((r) => (
            <div key={r.std} className="flex gap-4 p-3 bg-secondary/30 rounded-lg">
              <code className="font-mono text-xs text-primary w-28 flex-shrink-0 pt-0.5">{r.std}</code>
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-border">{title}</h2>
      {children}
    </section>
  );
}

function ThreatRow({ threat, response }: { threat: string; response: string }) {
  return (
    <div className="flex gap-4 p-4 bg-card border border-border rounded-lg">
      <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" aria-hidden="true" />
      <div>
        <p className="font-medium">{threat}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{response}</p>
      </div>
    </div>
  );
}
