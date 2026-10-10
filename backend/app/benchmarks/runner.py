from __future__ import annotations

import gc
import os
import platform
import random
import time
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.benchmarks.stats import summarize_ms
from app.core.pqc import KEM, PQCError, Signer


def _timed_ms(fn) -> float:
    start = time.perf_counter_ns()
    fn()
    end = time.perf_counter_ns()
    return (end - start) / 1_000_000


def run_benchmarks(
    kems: list[str],
    sigs: list[str],
    iterations: int,
    message_sizes: list[int],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    env = {
        "cpu": platform.processor(),
        "os": platform.platform(),
        "python": platform.python_version(),
        "location": "server",
    }

    jobs = [("kem", k) for k in kems] + [("sig", s) for s in sigs]
    random.shuffle(jobs)

    rows: list[dict[str, Any]] = []

    gc_was_enabled = gc.isenabled()
    gc.disable()
    try:
        for job_type, alg in jobs:
            if job_type == "kem":
                try:
                    kem = KEM(alg)
                except PQCError:
                    continue

                warmup = 10
                for _ in range(warmup):
                    pk, sk = kem.keygen()
                    ct, _ = kem.encaps(pk)
                    kem.decaps(sk, ct)

                keygen_times: list[float] = []
                encaps_times: list[float] = []
                decaps_times: list[float] = []
                pk, sk = kem.keygen()
                ct, _ = kem.encaps(pk)
                for _ in range(iterations):
                    keygen_times.append(_timed_ms(lambda: kem.keygen()))
                    encaps_times.append(_timed_ms(lambda: kem.encaps(pk)))
                    decaps_times.append(_timed_ms(lambda: kem.decaps(sk, ct)))

                for op, samples in (
                    ("keygen", keygen_times),
                    ("encaps", encaps_times),
                    ("decaps", decaps_times),
                ):
                    rows.append(
                        {
                            "operation": op,
                            "algorithm": alg,
                            "input_size_bytes": None,
                            "iterations": iterations,
                            **summarize_ms(samples),
                            "public_key_bytes": len(pk),
                            "secret_key_bytes": len(sk),
                            "ciphertext_or_signature_bytes": len(ct),
                        }
                    )

            if job_type == "sig":
                try:
                    signer = Signer(alg)
                except PQCError:
                    continue

                pk, sk = signer.keygen()
                warmup = 10
                for _ in range(warmup):
                    sig = signer.sign(sk, b"warmup")
                    signer.verify(pk, b"warmup", sig)

                for size in message_sizes:
                    message = os.urandom(size)
                    sign_times: list[float] = []
                    verify_times: list[float] = []
                    sig_lengths: list[int] = []
                    for _ in range(iterations):
                        sig = signer.sign(sk, message)
                        sig_lengths.append(len(sig))
                        sign_times.append(_timed_ms(lambda: signer.sign(sk, message)))
                        verify_times.append(_timed_ms(lambda: signer.verify(pk, message, sig)))

                    rows.append(
                        {
                            "operation": "sign",
                            "algorithm": alg,
                            "input_size_bytes": size,
                            "iterations": iterations,
                            **summarize_ms(sign_times),
                            "public_key_bytes": len(pk),
                            "secret_key_bytes": len(sk),
                            "ciphertext_or_signature_bytes": int(sum(sig_lengths) / len(sig_lengths)),
                        }
                    )
                    rows.append(
                        {
                            "operation": "verify",
                            "algorithm": alg,
                            "input_size_bytes": size,
                            "iterations": iterations,
                            **summarize_ms(verify_times),
                            "public_key_bytes": len(pk),
                            "secret_key_bytes": len(sk),
                            "ciphertext_or_signature_bytes": max(sig_lengths) if sig_lengths else 0,
                        }
                    )

        for size in [1_048_576, 10_485_760]:
            key = AESGCM.generate_key(bit_length=256)
            aes = AESGCM(key)
            nonce = os.urandom(12)
            msg = os.urandom(size)
            encrypt_times = [_timed_ms(lambda: aes.encrypt(nonce, msg, b"")) for _ in range(iterations)]
            ct = aes.encrypt(nonce, msg, b"")
            decrypt_times = [_timed_ms(lambda: aes.decrypt(nonce, ct, b"")) for _ in range(iterations)]
            rows.append(
                {
                    "operation": "aes_encrypt",
                    "algorithm": "AES-256-GCM",
                    "input_size_bytes": size,
                    "iterations": iterations,
                    **summarize_ms(encrypt_times),
                    "public_key_bytes": None,
                    "secret_key_bytes": None,
                    "ciphertext_or_signature_bytes": len(ct),
                }
            )
            rows.append(
                {
                    "operation": "aes_decrypt",
                    "algorithm": "AES-256-GCM",
                    "input_size_bytes": size,
                    "iterations": iterations,
                    **summarize_ms(decrypt_times),
                    "public_key_bytes": None,
                    "secret_key_bytes": None,
                    "ciphertext_or_signature_bytes": len(ct),
                }
            )
    finally:
        if gc_was_enabled:
            gc.enable()

    return env, rows
