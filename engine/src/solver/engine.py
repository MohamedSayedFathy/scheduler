"""Solver orchestrator — ties together variables, constraints, and solution extraction."""

import hashlib
import hmac
import time
from typing import Any

import httpx
import structlog
from ortools.sat.python import cp_model

from src.api.schemas import (
    Conflict,
    ConstraintType,
    ScheduleEntry,
    SolveRequest,
    SolveResult,
    SolveResultStatus,
    SolverStats,
    SolverStatus,
)
from src.config import settings
from src.solver.hard_constraints import add_hard_constraints
from src.solver.problem import ProblemData
from src.solver.soft_constraints import add_soft_constraints_and_objective
from src.solver.variables import create_variables

logger = structlog.get_logger()


def solve(request: SolveRequest) -> SolveResult:
    """Run the CP-SAT solver on the scheduling problem.

    Args:
        request: The solve request with all problem data.

    Returns:
        SolveResult with entries if solved, conflicts if infeasible.
    """
    start_time = time.monotonic()

    # 1. Build indexed problem data
    problem = ProblemData.from_request(request)
    model = cp_model.CpModel()

    # 2. Create decision variables (with pre-filtering)
    assign, teach = create_variables(model, problem)

    if not assign:
        # No feasible variable exists at all
        return SolveResult(
            job_id="",  # Will be set by caller
            tenant_id=request.tenant_id,
            schedule_id=request.schedule_id,
            status=SolveResultStatus.INFEASIBLE,
            entries=[],
            conflicts=[
                Conflict(
                    constraint_type=ConstraintType.ROOM_CAPACITY,
                    message="No feasible room/time assignment exists. Check room capacities and types.",
                )
            ],
            stats=SolverStats(
                status=SolverStatus.INFEASIBLE,
                wall_time_seconds=time.monotonic() - start_time,
            ),
        )

    # 3. Add constraints
    add_hard_constraints(model, assign, teach, problem)
    penalty_vars = add_soft_constraints_and_objective(model, assign, teach, problem)

    # 4. Configure solver
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = request.solver_config.timeout_seconds
    solver.parameters.num_workers = request.solver_config.num_workers
    if request.solver_config.random_seed is not None:
        solver.parameters.random_seed = request.solver_config.random_seed

    # 5. Solve
    logger.info(
        "solver_starting",
        num_variables=len(assign),
        num_sessions=len(problem.sessions),
        timeout=request.solver_config.timeout_seconds,
    )

    status = solver.solve(model)
    wall_time = time.monotonic() - start_time

    # 6. Map CP-SAT status to our enum
    status_map = {
        cp_model.OPTIMAL: SolverStatus.OPTIMAL,
        cp_model.FEASIBLE: SolverStatus.FEASIBLE,
        cp_model.INFEASIBLE: SolverStatus.INFEASIBLE,
        cp_model.UNKNOWN: SolverStatus.UNKNOWN,
        cp_model.MODEL_INVALID: SolverStatus.MODEL_INVALID,
    }
    solver_status = status_map.get(status, SolverStatus.UNKNOWN)

    logger.info(
        "solver_finished",
        status=solver_status.value,
        wall_time=round(wall_time, 2),
        objective=solver.objective_value if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
    )

    # 7. Extract solution
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        entries = _extract_entries(solver, assign, teach, problem)
        soft_scores = _extract_soft_scores(solver, penalty_vars)

        return SolveResult(
            job_id="",
            tenant_id=request.tenant_id,
            schedule_id=request.schedule_id,
            status=SolveResultStatus.SOLVED,
            entries=entries,
            stats=SolverStats(
                status=solver_status,
                wall_time_seconds=round(wall_time, 3),
                objective_value=solver.objective_value,
                num_branches=solver.num_branches,
                num_conflicts=solver.num_conflicts,
                soft_constraint_scores=soft_scores,
            ),
        )

    # 8. Handle infeasible / timeout
    result_status = (
        SolveResultStatus.INFEASIBLE
        if solver_status == SolverStatus.INFEASIBLE
        else SolveResultStatus.TIMEOUT
        if solver_status == SolverStatus.UNKNOWN
        else SolveResultStatus.FAILED
    )

    return SolveResult(
        job_id="",
        tenant_id=request.tenant_id,
        schedule_id=request.schedule_id,
        status=result_status,
        stats=SolverStats(
            status=solver_status,
            wall_time_seconds=round(wall_time, 3),
        ),
        error_message=f"Solver returned status: {solver_status.value}",
    )


def _extract_entries(
    solver: cp_model.CpSolver,
    assign: dict[tuple[int, int, int], cp_model.IntVar],
    teach: dict[tuple[int, int], cp_model.IntVar],
    problem: ProblemData,
) -> list[ScheduleEntry]:
    """Extract assigned entries from solver solution."""
    # Extract assigned lecturer from teach vars
    assigned_lecturer: dict[int, int] = {}
    for (s_idx, l_idx), var in teach.items():
        if solver.value(var) == 1:
            assigned_lecturer[s_idx] = l_idx

    # Group time slots by session using occupied chain
    session_assignments: dict[int, tuple[int, list[int]]] = {}

    for (s_idx, r_idx, t_idx), var in assign.items():
        if solver.value(var) == 1:
            occupied = problem.get_occupied_slots(s_idx, t_idx)
            if occupied is None:
                occupied = [t_idx]
            session_assignments[s_idx] = (r_idx, occupied)

    entries: list[ScheduleEntry] = []
    for s_idx, (r_idx, t_indices) in session_assignments.items():
        lecturer_id = None
        if s_idx in assigned_lecturer:
            lecturer_id = problem.lecturers[assigned_lecturer[s_idx]].id

        entries.append(
            ScheduleEntry(
                session_id=problem.sessions[s_idx].id,
                room_id=problem.rooms[r_idx].id,
                time_slot_ids=[problem.time_slots[t].id for t in sorted(t_indices)],
                assigned_lecturer_id=lecturer_id,
            )
        )

    return entries


def _extract_soft_scores(
    solver: cp_model.CpSolver,
    penalty_vars: list[tuple[str, cp_model.IntVar]],
) -> dict[str, float]:
    """Extract soft constraint penalty scores from the solution."""
    return {name: float(solver.value(var)) for name, var in penalty_vars}


async def run_solve_job(job_id: str, request: SolveRequest) -> None:
    """Background task: run solver and POST result back to callback URL."""
    try:
        result = solve(request)
        result.job_id = job_id

        # Sign the payload with HMAC
        payload = result.model_dump_json(by_alias=True)
        signature = hmac.new(
            settings.engine_hmac_secret.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                request.callback_url,
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Engine-Signature": signature,
                },
            )
            logger.info(
                "callback_sent",
                job_id=job_id,
                callback_url=request.callback_url,
                status_code=response.status_code,
            )

    except Exception:
        logger.exception("solve_job_failed", job_id=job_id)
