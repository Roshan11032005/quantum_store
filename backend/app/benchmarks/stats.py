from __future__ import annotations

import statistics


def summarize_ms(samples_ms: list[float]) -> dict[str, float]:
    if not samples_ms:
        return {
            "mean_ms": 0.0,
            "median_ms": 0.0,
            "stdev_ms": 0.0,
            "p95_ms": 0.0,
            "min_ms": 0.0,
            "max_ms": 0.0,
        }

    ordered = sorted(samples_ms)
    p95_index = max(0, min(len(ordered) - 1, int(0.95 * (len(ordered) - 1))))
    return {
        "mean_ms": statistics.mean(ordered),
        "median_ms": statistics.median(ordered),
        "stdev_ms": statistics.stdev(ordered) if len(ordered) > 1 else 0.0,
        "p95_ms": ordered[p95_index],
        "min_ms": ordered[0],
        "max_ms": ordered[-1],
    }
