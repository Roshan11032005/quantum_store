from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import importlib
from typing import Any


class PQCError(Exception):
    pass


@lru_cache
def _load_oqs():
    try:
        return importlib.import_module("oqs")
    except Exception:
        return None


@dataclass(slots=True)
class AlgorithmInfo:
    friendly: str
    liboqs_name: str
    details: dict[str, Any]


FRIENDLY_EQUIVALENTS = {
    "SLH-DSA-SHA2-128f": ["SLH-DSA-SHA2-128f", "SLH_DSA_PURE_SHA2_128F", "SPHINCS+-SHA2-128f-simple"],
    "SLH-DSA-SHA2-128s": ["SLH-DSA-SHA2-128s", "SLH_DSA_PURE_SHA2_128S", "SPHINCS+-SHA2-128s-simple"],
    "ML-DSA-44": ["ML-DSA-44", "Dilithium2"],
    "ML-DSA-65": ["ML-DSA-65", "Dilithium3"],
    "ML-DSA-87": ["ML-DSA-87", "Dilithium5"],
}


@lru_cache
def discover_algorithms() -> dict[str, dict[str, AlgorithmInfo]]:
    oqs = _load_oqs()
    if oqs is None:
        return {"kem": {}, "sig": {}}

    enabled_kems = set(oqs.get_enabled_kem_mechanisms())
    enabled_sigs = set(oqs.get_enabled_sig_mechanisms())

    kem_map: dict[str, AlgorithmInfo] = {}
    sig_map: dict[str, AlgorithmInfo] = {}

    for name in enabled_kems:
        with oqs.KeyEncapsulation(name) as kem:
            details = kem.details
        kem_map[name] = AlgorithmInfo(friendly=name, liboqs_name=name, details=details)

    for name in enabled_sigs:
        with oqs.Signature(name) as sig:
            details = sig.details
        sig_map[name] = AlgorithmInfo(friendly=name, liboqs_name=name, details=details)

    for friendly, aliases in FRIENDLY_EQUIVALENTS.items():
        for alias in aliases:
            if alias in sig_map and friendly not in sig_map:
                sig_map[friendly] = AlgorithmInfo(
                    friendly=friendly,
                    liboqs_name=sig_map[alias].liboqs_name,
                    details=sig_map[alias].details,
                )
                break

    return {"kem": kem_map, "sig": sig_map}


def resolve_kem_name(name: str) -> str:
    mapping = discover_algorithms()["kem"]
    if name not in mapping:
        raise PQCError(f"Unsupported KEM algorithm: {name}")
    return mapping[name].liboqs_name


def resolve_sig_name(name: str) -> str:
    mapping = discover_algorithms()["sig"]
    if name not in mapping:
        raise PQCError(f"Unsupported signature algorithm: {name}")
    return mapping[name].liboqs_name


class KEM:
    def __init__(self, alg: str):
        self._oqs = _load_oqs()
        oqs = self._oqs
        if oqs is None:
            raise PQCError("liboqs-python is not available")
        self.alg = resolve_kem_name(alg)

    def keygen(self) -> tuple[bytes, bytes]:
        try:
            with self._oqs.KeyEncapsulation(self.alg) as kem:
                pk = kem.generate_keypair()
                sk = kem.export_secret_key()
                return pk, sk
        except Exception as exc:
            raise PQCError(f"KEM keygen failed: {exc}") from exc

    def encaps(self, pk: bytes) -> tuple[bytes, bytes]:
        try:
            with self._oqs.KeyEncapsulation(self.alg) as kem:
                return kem.encap_secret(pk)
        except Exception as exc:
            raise PQCError(f"KEM encaps failed: {exc}") from exc

    def decaps(self, sk: bytes, ct: bytes) -> bytes:
        try:
            with self._oqs.KeyEncapsulation(self.alg, secret_key=sk) as kem:
                return kem.decap_secret(ct)
        except Exception as exc:
            raise PQCError(f"KEM decaps failed: {exc}") from exc


class Signer:
    def __init__(self, alg: str):
        self._oqs = _load_oqs()
        oqs = self._oqs
        if oqs is None:
            raise PQCError("liboqs-python is not available")
        self.alg = resolve_sig_name(alg)

    def keygen(self) -> tuple[bytes, bytes]:
        try:
            with self._oqs.Signature(self.alg) as sig:
                pk = sig.generate_keypair()
                sk = sig.export_secret_key()
                return pk, sk
        except Exception as exc:
            raise PQCError(f"Signature keygen failed: {exc}") from exc

    def sign(self, sk: bytes, msg: bytes) -> bytes:
        try:
            with self._oqs.Signature(self.alg, secret_key=sk) as sig:
                return sig.sign(msg)
        except Exception as exc:
            raise PQCError(f"Signature sign failed: {exc}") from exc

    def verify(self, pk: bytes, msg: bytes, signature: bytes) -> bool:
        try:
            with self._oqs.Signature(self.alg) as sig:
                return bool(sig.verify(msg, signature, pk))
        except Exception as exc:
            raise PQCError(f"Signature verify failed: {exc}") from exc


# Standard names used in version/status fields
_STANDARD_MAP: dict[str, str] = {
    "FIPS203": "FIPS 203", "FIPS204": "FIPS 204", "FIPS205": "FIPS 205",
    "draft": "Draft", "Falcon": "Draft FN-DSA",
}


def _kem_standard(name: str, details: dict) -> str:
    ver = details.get("version", "")
    if "FIPS203" in ver:
        return "FIPS 203"
    if "Kyber" in name:
        return "Round 3 (legacy)"
    return ver or "—"


def _sig_standard(name: str, details: dict) -> str:
    ver = details.get("version", "")
    if "FIPS204" in ver:
        return "FIPS 204"
    if "FIPS205" in ver or "SPHINCS" in name:
        return "FIPS 205"
    if "Falcon" in name:
        return "Draft FN-DSA"
    if "Dilithium" in name:
        return "Round 3 (legacy)"
    return ver or "—"


def _sig_status(name: str) -> str:
    if any(x in name for x in ("ML-DSA", "ML-KEM", "SLH-DSA", "SLH_DSA")):
        return "Standardized"
    if "Falcon" in name:
        return "Selected (Draft FN-DSA)"
    if any(x in name for x in ("Dilithium", "Kyber")):
        return "Deprecated (pre-standard)"
    return "Experimental"


def get_algorithm_catalog() -> dict[str, list[dict[str, Any]]]:
    discovered = discover_algorithms()

    def kem_rows() -> list[dict[str, Any]]:
        rows = []
        for friendly, info in sorted(discovered["kem"].items()):
            d = info.details
            rows.append({
                "name": friendly,
                "liboqs_name": info.liboqs_name,
                "type": "kem",
                "nist_level": d.get("claimed_nist_level", 0),
                "public_key_size": d.get("length_public_key", 0),
                "secret_key_size": d.get("length_secret_key", 0),
                "ciphertext_size": d.get("length_ciphertext") or d.get("length_ciphertext_bytes"),
                "signature_size": None,
                "standard": _kem_standard(friendly, d),
                "status": _sig_status(friendly),
                "details": d,
            })
        return rows

    def sig_rows() -> list[dict[str, Any]]:
        rows = []
        for friendly, info in sorted(discovered["sig"].items()):
            d = info.details
            rows.append({
                "name": friendly,
                "liboqs_name": info.liboqs_name,
                "type": "sig",
                "nist_level": d.get("claimed_nist_level", 0),
                "public_key_size": d.get("length_public_key", 0),
                "secret_key_size": d.get("length_secret_key", 0),
                "ciphertext_size": None,
                "signature_size": d.get("length_signature") or d.get("length_signature_bytes"),
                "standard": _sig_standard(friendly, d),
                "status": _sig_status(friendly),
                "details": d,
            })
        return rows

    return {"kems": kem_rows(), "sigs": sig_rows()}
