/**
 * Landing.tsx — Public landing page.
 */

import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border p-4 flex items-center justify-between">
        <div>
          <span className="text-xl font-bold"><span className="text-primary">Quantum</span>Store</span>
        </div>
        <nav className="flex gap-4">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Login</Link>
          <Link to="/register" className="text-sm bg-primary text-primary-foreground px-4 py-1.5 rounded-md hover:bg-primary/90 transition-colors">Register</Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16">
        <div className="max-w-3xl">
          <div className="mb-6">
            <span className="inline-block px-3 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full mb-4">
              NIST Post-Quantum Cryptography · FIPS 203 · FIPS 204 · FIPS 205
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Quantum-Resistant Cloud Storage
          </h1>
          <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
            A quantum-resistant cloud storage system that uses NIST-standardized post-quantum cryptography
            for secure file storage, authentication, and performance evaluation.
          </p>
          <p className="text-sm text-muted-foreground mb-10 p-4 bg-secondary rounded-lg border border-border">
            🔒 Plaintext files and secret keys <strong>never leave your browser</strong>.
            All encryption and signing happen on your device.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors text-base"
            >
              Get Started — Register
            </Link>
            <Link
              to="/login"
              className="px-8 py-3 border border-border rounded-lg font-medium hover:bg-secondary transition-colors text-base"
            >
              Sign In
            </Link>
            <Link
              to="/benchmarks"
              className="px-8 py-3 border border-primary/30 text-primary rounded-lg font-medium hover:bg-primary/5 transition-colors text-base"
            >
              View Benchmarks
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl w-full text-left">
          {[
            {
              icon: '🔐',
              title: 'ML-KEM + ML-DSA',
              desc: 'NIST-standardized ML-KEM (FIPS 203) for key encapsulation and ML-DSA (FIPS 204) for digital signatures.',
            },
            {
              icon: '🛡',
              title: 'Zero-Knowledge Server',
              desc: 'The server stores only ciphertext. Decryption keys never leave your browser. Even a compromised server cannot read your files.',
            },
            {
              icon: '📊',
              title: 'Performance Evaluation',
              desc: 'Benchmark and compare ML-KEM, ML-DSA, Falcon, and SPHINCS+ with rich visualizations and CSV/JSON export.',
            },
          ].map((f) => (
            <div key={f.title} className="p-6 bg-card border border-border rounded-xl">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border p-4 text-center text-xs text-muted-foreground">
        Post-Quantum Storage System · Research Project · Built with ML-KEM, ML-DSA, SLH-DSA, Falcon
      </footer>
    </div>
  );
}
