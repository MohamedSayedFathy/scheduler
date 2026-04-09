"""Solver orchestrator — ties together variables, constraints, and solution extraction."""

import asyncio
import hashlib
import hmac
import time
from collections import defaultdict
from typing import Any

import httpx
import structlog
from ortools.sat.python import cp_model

from src.api.schemas import (
    Conflict,
    ConstraintType,
    Lecturer,
    ScheduleEntry,
    Session,
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


def _partition_by_week(
    request: SolveRequest,
) -> list[SolveRequest]:
    """Split a large request into independent weekly sub-problems.

    Sessions are grouped by their allowed_time_slot_ids. Sessions sharing
    the same set of allowed slots belong to the same week. Each sub-request
    only includes the time slots relevant to that week, plus all rooms,
    lecturers, student groups (filtered to relevant slots).
    """
    all_time_slot_ids = {ts.id for ts in request.time_slots}
    ts_map = {ts.id: ts for ts in request.time_slots}

    # Group sessions by their allowed time slot set (frozen set as key)
    week_groups: defaultdict[frozenset[str], list[Session]] = defaultdict(list)
    ungrouped: list[Session] = []

    for session in request.sessions:
        if session.allowed_time_slot_ids:
            key = frozenset(session.allowed_time_slot_ids)
            week_groups[key].append(session)
        else:
            ungrouped.append(session)

    # If no partitioning possible, return original
    if len(week_groups) <= 1 and not ungrouped:
        return [request]
    if not week_groups and ungrouped:
        return [request]

    sub_requests: list[SolveRequest] = []

    for week_slot_ids, sessions in week_groups.items():
        # Only include time slots for this week
        week_slots = [ts_map[ts_id] for ts_id in week_slot_ids if ts_id in ts_map]

        # Filter lecturer availability to only this week's slots
        week_lecturers = []
        for lec in request.lecturers:
            week_avail = [ts_id for ts_id in lec.available_time_slot_ids if ts_id in week_slot_ids]
            week_preferred = [ts_id for ts_id in lec.preferred_time_slot_ids if ts_id in week_slot_ids]
            week_lecturers.append(Lecturer(
                id=lec.id,
                name=lec.name,
                available_time_slot_ids=week_avail,
                preferred_time_slot_ids=week_preferred,
                preferred_room_ids=lec.preferred_room_ids,
                max_consecutive_slots=lec.max_consecutive_slots,
            ))

        sub_requests.append(SolveRequest(
            tenant_id=request.tenant_id,
            schedule_id=request.schedule_id,
            callback_url=request.callback_url,
            rooms=request.rooms,
            time_slots=week_slots,
            sessions=sessions,
            lecturers=week_lecturers,
            student_groups=request.student_groups,
            constraints=request.constraints,
            solver_config=request.solver_config,
        ))

    # Add ungrouped sessions (no allowed_time_slot_ids) to the first sub-request
    # or create a separate one with all time slots
    if ungrouped:
        sub_requests.append(SolveRequest(
            tenant_id=request.tenant_id,
            schedule_id=request.schedule_id,
            callback_url=request.callback_url,
            rooms=request.rooms,
            time_slots=request.time_slots,
            sessions=ungrouped,
            lecturers=request.lecturers,
            student_groups=request.student_groups,
            constraints=request.constraints,
            solver_config=request.solver_config,
        ))

    return sub_requests


def solve(request: SolveRequest) -> SolveResult:
    """Run the CP-SAT solver on the scheduling problem.

    If the problem can be partitioned into independent weekly sub-problems,
    each week is solved separately for dramatically better performance.
    """
    start_time = time.monotonic()

    # Partition into weekly sub-problems
    sub_requests = _partition_by_week(request)

    if len(sub_requests) > 1:
        logger.info(
            "partitioned_into_weeks",
            num_weeks=len(sub_requests),
            sessions_per_week=[len(sr.sessions) for sr in sub_requests],
        )
        return _solve_partitioned(request, sub_requests, start_time)

    # Single problem (no partitioning possible)
    return _solve_single(request, start_time)


def _solve_partitioned(
    original_request: SolveRequest,
    sub_requests: list[SolveRequest],
    start_time: float,
) -> SolveResult:
    """Solve each weekly sub-problem independently and merge results."""
    all_entries: list[ScheduleEntry] = []
    all_conflicts: list[Conflict] = []
    total_branches = 0
    total_conflicts_count = 0
    worst_status = SolverStatus.OPTIMAL

    # Per-week timeout: each weekly sub-problem is ~17x smaller than the original,
    # so it should solve much faster. Allow 30s per week.
    per_week_timeout = 30

    for i, sub_req in enumerate(sub_requests):
        week_start = time.monotonic()
        logger.info(
            "solving_week",
            week=i + 1,
            total_weeks=len(sub_requests),
            num_sessions=len(sub_req.sessions),
            num_time_slots=len(sub_req.time_slots),
            timeout=per_week_timeout,
        )

        # Override timeout for this sub-problem
        sub_req.solver_config.timeout_seconds = per_week_timeout

        result = _solve_single(sub_req, week_start)

        logger.info(
            "week_solved",
            week=i + 1,
            status=result.status.value,
            num_entries=len(result.entries),
            wall_time=round(time.monotonic() - week_start, 2),
        )

        if result.status == SolveResultStatus.SOLVED:
            all_entries.extend(result.entries)
            if result.stats:
                total_branches += result.stats.num_branches or 0
                total_conflicts_count += result.stats.num_conflicts or 0
                if result.stats.status.value > worst_status.value:
                    worst_status = result.stats.status
        elif result.status == SolveResultStatus.INFEASIBLE:
            all_conflicts.extend(result.conflicts or [])
            all_conflicts.append(Conflict(
                constraint_type=ConstraintType.ROOM_CAPACITY,
                message=f"Week {i + 1} is infeasible.",
            ))
            # Continue solving other weeks
            worst_status = SolverStatus.INFEASIBLE
        else:
            # Timeout or failure
            if worst_status != SolverStatus.INFEASIBLE:
                worst_status = SolverStatus.UNKNOWN

    wall_time = time.monotonic() - start_time

    if all_entries:
        return SolveResult(
            job_id="",
            tenant_id=original_request.tenant_id,
            schedule_id=original_request.schedule_id,
            status=SolveResultStatus.SOLVED,
            entries=all_entries,
            conflicts=all_conflicts if all_conflicts else None,
            stats=SolverStats(
                status=worst_status,
                wall_time_seconds=round(wall_time, 3),
                num_branches=total_branches,
                num_conflicts=total_conflicts_count,
            ),
        )

    # All weeks failed
    result_status = (
        SolveResultStatus.INFEASIBLE
        if worst_status == SolverStatus.INFEASIBLE
        else SolveResultStatus.TIMEOUT
        if worst_status == SolverStatus.UNKNOWN
        else SolveResultStatus.FAILED
    )

    return SolveResult(
        job_id="",
        tenant_id=original_request.tenant_id,
        schedule_id=original_request.schedule_id,
        status=result_status,
        conflicts=all_conflicts if all_conflicts else None,
        stats=SolverStats(
            status=worst_status,
            wall_time_seconds=round(wall_time, 3),
        ),
        error_message=f"All {len(sub_requests)} weeks failed to solve.",
    )


def _solve_single(request: SolveRequest, start_time: float) -> SolveResult:
    """Run the CP-SAT solver on a single (possibly partitioned) problem."""
    # 1. Build indexed problem data
    problem = ProblemData.from_request(request)
    model = cp_model.CpModel()

    # 2. Create decision variables (with pre-filtering)
    assign, teach = create_variables(model, problem)

    if not assign:
        return SolveResult(
            job_id="",
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

    # 6. Map CP-SAT status
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
        # Run CPU-bound solver in a thread pool to avoid blocking the event loop
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, solve, request)
        result.job_id = job_id

        # Sign the payload with HMAC
        payload = result.model_dump_json(by_alias=True)
        signature = hmac.new(
            settings.engine_hmac_secret.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()

        async with httpx.AsyncClient(timeout=120.0) as client:
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

    except Exception as e:
        import traceback
        logger.error(
            "solve_job_failed",
            job_id=job_id,
            error=str(e),
            traceback=traceback.format_exc(),
        )
