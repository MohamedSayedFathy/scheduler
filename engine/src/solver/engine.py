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

    If the problem can be partitioned into weekly sub-problems, only the
    first week is solved and its assignment is replicated across all weeks.
    """
    start_time = time.monotonic()

    sub_requests = _partition_by_week(request)

    if len(sub_requests) > 1:
        logger.info(
            "partitioned_into_weeks",
            num_weeks=len(sub_requests),
            sessions_per_week=[len(sr.sessions) for sr in sub_requests],
        )
        return _solve_replicated(request, sub_requests, start_time)

    return _solve_single(request, start_time)


def _solve_replicated(
    original_request: SolveRequest,
    sub_requests: list[SolveRequest],
    start_time: float,
) -> SolveResult:
    """Solve only the first week, then replicate the schedule to all other weeks.

    Sessions across weeks are matched by position (sub_requests preserve insertion
    order from the web layer). Time slots are matched across weeks by
    (day_of_week, start_time, end_time). Rooms and lecturers transfer as-is.
    """
    template_sub = sub_requests[0]
    template_sub.solver_config.timeout_seconds = max(
        template_sub.solver_config.timeout_seconds, 60
    )

    logger.info(
        "solving_template_week",
        num_sessions=len(template_sub.sessions),
        num_time_slots=len(template_sub.time_slots),
        timeout=template_sub.solver_config.timeout_seconds,
    )

    template_result = _solve_single(template_sub, time.monotonic())

    logger.info(
        "template_week_solved",
        status=template_result.status.value,
        num_entries=len(template_result.entries),
    )

    if template_result.status != SolveResultStatus.SOLVED:
        wall_time = time.monotonic() - start_time
        return SolveResult(
            job_id="",
            tenant_id=original_request.tenant_id,
            schedule_id=original_request.schedule_id,
            status=template_result.status,
            entries=[],
            conflicts=template_result.conflicts,
            stats=SolverStats(
                status=template_result.stats.status if template_result.stats else SolverStatus.UNKNOWN,
                wall_time_seconds=round(wall_time, 3),
            ),
            error_message=template_result.error_message or "Template week failed to solve.",
        )

    template_ts_by_id = {ts.id: ts for ts in template_sub.time_slots}
    template_entry_by_session_id = {e.session_id: e for e in template_result.entries}

    all_entries: list[ScheduleEntry] = list(template_result.entries)
    replicated_count = 0
    skipped_count = 0

    for sub in sub_requests[1:]:
        ts_by_day_time: dict[tuple[str, str, str], str] = {
            (ts.day_of_week.value, ts.start_time, ts.end_time): ts.id
            for ts in sub.time_slots
        }

        for week_session, template_session in zip(sub.sessions, template_sub.sessions):
            template_entry = template_entry_by_session_id.get(template_session.id)
            if template_entry is None:
                skipped_count += 1
                continue

            new_ts_ids: list[str] = []
            for ts_id in template_entry.time_slot_ids:
                template_ts = template_ts_by_id.get(ts_id)
                if template_ts is None:
                    continue
                key = (template_ts.day_of_week.value, template_ts.start_time, template_ts.end_time)
                mapped = ts_by_day_time.get(key)
                if mapped is not None:
                    new_ts_ids.append(mapped)

            if not new_ts_ids:
                skipped_count += 1
                continue

            all_entries.append(ScheduleEntry(
                session_id=week_session.id,
                room_id=template_entry.room_id,
                time_slot_ids=new_ts_ids,
                assigned_lecturer_id=template_entry.assigned_lecturer_id,
            ))
            replicated_count += 1

    wall_time = time.monotonic() - start_time
    logger.info(
        "replicated_to_other_weeks",
        template_entries=len(template_result.entries),
        replicated_entries=replicated_count,
        skipped=skipped_count,
        total_entries=len(all_entries),
        wall_time=round(wall_time, 2),
    )

    return SolveResult(
        job_id="",
        tenant_id=original_request.tenant_id,
        schedule_id=original_request.schedule_id,
        status=SolveResultStatus.SOLVED,
        entries=all_entries,
        conflicts=[],
        stats=SolverStats(
            status=template_result.stats.status if template_result.stats else SolverStatus.OPTIMAL,
            wall_time_seconds=round(wall_time, 3),
            objective_value=template_result.stats.objective_value if template_result.stats else None,
            num_branches=template_result.stats.num_branches if template_result.stats else 0,
            num_conflicts=template_result.stats.num_conflicts if template_result.stats else 0,
            soft_constraint_scores=template_result.stats.soft_constraint_scores if template_result.stats else {},
        ),
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
