from __future__ import annotations

import asyncio
import csv
import io
import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.db.session import SessionLocal, get_db_session
from app.deps import get_current_user
from app.schemas.benchmarks import BenchmarkRunRequest, BenchmarkRunResponse
from app.services.benchmark_service import (
    create_benchmark_run,
    execute_benchmark_run,
    get_results,
    get_run,
    list_runs,
)

router = APIRouter(prefix="/benchmarks", tags=["benchmarks"])


async def _execute_run_background(run_id: str, params: dict) -> None:
    async with SessionLocal() as db:
        run = await get_run(db, run_id)
        if run is None:
            return
        await execute_benchmark_run(db, run, params)


@router.post("/run", response_model=BenchmarkRunResponse)
async def run_benchmarks_api(
    payload: BenchmarkRunRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> BenchmarkRunResponse:
    params = payload.model_dump()
    run = await create_benchmark_run(db, current_user.id, params)
    background_tasks.add_task(_execute_run_background, run.id, params)
    return BenchmarkRunResponse(run_id=run.id)


@router.get("/runs")
async def benchmark_runs(db: AsyncSession = Depends(get_db_session)) -> list[dict]:
    runs = await list_runs(db)
    return [
        {
            "id": run.id,
            "status": run.status,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "created_by": run.created_by,
        }
        for run in runs
    ]


@router.get("/runs/{run_id}")
async def benchmark_run_detail(run_id: str, db: AsyncSession = Depends(get_db_session)) -> dict:
    run = await get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Not found")
    results = await get_results(db, run_id)
    return {
        "id": run.id,
        "status": run.status,
        "environment": run.environment,
        "params": run.params,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "results": [
            {
                "operation": r.operation,
                "algorithm": r.algorithm,
                "input_size_bytes": r.input_size_bytes,
                "iterations": r.iterations,
                "mean_ms": r.mean_ms,
                "median_ms": r.median_ms,
                "stdev_ms": r.stdev_ms,
                "p95_ms": r.p95_ms,
                "min_ms": r.min_ms,
                "max_ms": r.max_ms,
                "public_key_bytes": r.public_key_bytes,
                "secret_key_bytes": r.secret_key_bytes,
                "ciphertext_or_signature_bytes": r.ciphertext_or_signature_bytes,
            }
            for r in results
        ],
    }


@router.get("/runs/{run_id}/export")
async def benchmark_export(
    run_id: str,
    format: str = Query("json", pattern="^(json|csv)$"),
    db: AsyncSession = Depends(get_db_session),
):
    run = await get_run(db, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Not found")
    results = await get_results(db, run_id)

    payload = [
        {
            "operation": r.operation,
            "algorithm": r.algorithm,
            "input_size_bytes": r.input_size_bytes,
            "iterations": r.iterations,
            "mean_ms": r.mean_ms,
            "median_ms": r.median_ms,
            "stdev_ms": r.stdev_ms,
            "p95_ms": r.p95_ms,
            "min_ms": r.min_ms,
            "max_ms": r.max_ms,
            "public_key_bytes": r.public_key_bytes,
            "secret_key_bytes": r.secret_key_bytes,
            "ciphertext_or_signature_bytes": r.ciphertext_or_signature_bytes,
        }
        for r in results
    ]

    if format == "json":
        return {"run": run.id, "environment": run.environment, "results": payload}

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(payload[0].keys()) if payload else ["operation"])
    writer.writeheader()
    writer.writerows(payload)
    return PlainTextResponse(output.getvalue(), media_type="text/csv")


@router.post("/runs/import")
async def benchmark_import(data: dict, db: AsyncSession = Depends(get_db_session)) -> dict:
    run = await create_benchmark_run(db, None, data.get("params", {}))
    run.environment = data.get("environment", {})
    run.status = "finished"
    run.finished_at = run.started_at
    for row in data.get("results", []):
        from app.db.models import BenchmarkResult

        db.add(BenchmarkResult(run_id=run.id, **row))
    await db.commit()
    return {"run_id": run.id}


@router.get("/compare")
async def benchmark_compare(runs: str, db: AsyncSession = Depends(get_db_session)) -> dict:
    ids = [x.strip() for x in runs.split(",") if x.strip()]
    out = []
    for run_id in ids:
        run = await get_run(db, run_id)
        if run is None:
            continue
        results = await get_results(db, run_id)
        out.append(
            {
                "run_id": run.id,
                "status": run.status,
                "environment": run.environment,
                "result_count": len(results),
            }
        )
    return {"runs": out}
