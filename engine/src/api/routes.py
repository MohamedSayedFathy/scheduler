"""API route definitions for the scheduling engine."""

import uuid
from typing import Any

import structlog
from fastapi import APIRouter, BackgroundTasks, HTTPException

from src.api.schemas import (
    HealthResponse,
    SolveAcceptedResponse,
    SolveRequest,
)
from src.solver.engine import run_solve_job

logger = structlog.get_logger()

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint for load balancer / monitoring."""
    import ortools

    return HealthResponse(
        status="ok",
        version="0.1.0",
        or_tools_version=ortools.__version__,
    )


@router.post("/solve", response_model=SolveAcceptedResponse)
async def solve_schedule(
    request: SolveRequest,
    background_tasks: BackgroundTasks,
) -> SolveAcceptedResponse:
    """Accept a scheduling job and process it in the background.

    Returns immediately with a job ID. When the solver finishes, it calls
    back to the web app's /api/webhooks/engine endpoint.
    """
    job_id = str(uuid.uuid4())

    logger.info(
        "solve_job_accepted",
        job_id=job_id,
        tenant_id=request.tenant_id,
        schedule_id=request.schedule_id,
        num_sessions=len(request.sessions),
        num_rooms=len(request.rooms),
        num_time_slots=len(request.time_slots),
    )

    # Run solver in background
    background_tasks.add_task(
        run_solve_job,
        job_id=job_id,
        request=request,
    )

    # Estimate based on problem size
    estimated_time = max(5, len(request.sessions) * len(request.rooms) // 100)

    return SolveAcceptedResponse(
        job_id=job_id,
        status="accepted",
        estimated_time_seconds=min(estimated_time, request.solver_config.timeout_seconds),
    )
