from __future__ import annotations

from fastapi import APIRouter

from app.core.pqc import get_algorithm_catalog
from app.schemas.algorithms import AlgorithmResponse

router = APIRouter(prefix="/algorithms", tags=["algorithms"])


@router.get("", response_model=AlgorithmResponse)
async def algorithms() -> AlgorithmResponse:
    catalog = get_algorithm_catalog()
    return AlgorithmResponse(kems=catalog["kems"], sigs=catalog["sigs"])
