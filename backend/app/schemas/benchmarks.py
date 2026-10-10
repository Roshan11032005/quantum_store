from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class BenchmarkRunRequest(BaseModel):
    kems: list[str] = Field(default_factory=list)
    sigs: list[str] = Field(default_factory=list)
    iterations: int = 100
    message_sizes: list[int] = Field(default_factory=lambda: [1024, 1_048_576])
    file_sizes_mb: list[int] = Field(default_factory=lambda: [1, 10, 100])
    include_e2e: bool = True


class BenchmarkRunResponse(BaseModel):
    run_id: str


class BenchmarkRunSummary(BaseModel):
    id: str
    status: str
    started_at: datetime
    finished_at: datetime | None
