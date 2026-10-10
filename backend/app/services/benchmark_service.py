from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.benchmarks.runner import run_benchmarks
from app.db.models import BenchmarkResult, BenchmarkRun


async def create_benchmark_run(db: AsyncSession, created_by: str | None, params: dict) -> BenchmarkRun:
    run = BenchmarkRun(created_by=created_by, params=params, environment={}, status="pending")
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


async def execute_benchmark_run(db: AsyncSession, run: BenchmarkRun, params: dict) -> None:
    run.status = "running"
    run.started_at = datetime.now(timezone.utc)
    await db.commit()

    env, rows = run_benchmarks(
        kems=params.get("kems", []),
        sigs=params.get("sigs", []),
        iterations=params.get("iterations", 100),
        message_sizes=params.get("message_sizes", [1024, 1_048_576]),
    )

    run.environment = env
    run.status = "finished"
    run.finished_at = datetime.now(timezone.utc)

    for row in rows:
        db.add(BenchmarkResult(run_id=run.id, **row))

    await db.commit()


async def list_runs(db: AsyncSession) -> list[BenchmarkRun]:
    rows = await db.execute(select(BenchmarkRun).order_by(BenchmarkRun.started_at.desc()))
    return list(rows.scalars().all())


async def get_run(db: AsyncSession, run_id: str) -> BenchmarkRun | None:
    return (await db.execute(select(BenchmarkRun).where(BenchmarkRun.id == run_id))).scalar_one_or_none()


async def get_results(db: AsyncSession, run_id: str) -> list[BenchmarkResult]:
    rows = await db.execute(select(BenchmarkResult).where(BenchmarkResult.run_id == run_id))
    return list(rows.scalars().all())
