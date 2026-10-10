from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from app.benchmarks.runner import run_benchmarks


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=200)
    parser.add_argument("--out", type=Path, default=Path("results"))
    parser.add_argument("--kems", default="ML-KEM-768")
    parser.add_argument("--sigs", default="ML-DSA-65,Falcon-512")
    args = parser.parse_args()

    kems = [x.strip() for x in args.kems.split(",") if x.strip()]
    sigs = [x.strip() for x in args.sigs.split(",") if x.strip()]
    env, rows = run_benchmarks(kems, sigs, args.iterations, [32, 1024, 1_048_576])

    args.out.mkdir(parents=True, exist_ok=True)
    payload = {"environment": env, "results": rows}
    (args.out / "results.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")

    if rows:
        with (args.out / "results.csv").open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)


if __name__ == "__main__":
    main()
