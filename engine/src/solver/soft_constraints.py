"""Soft constraints and objective function for the CP-SAT solver.

Soft constraints are preferences that the solver tries to satisfy but
can violate if necessary. They're implemented as penalty terms in the
objective function, which the solver minimizes.
"""

from ortools.sat.python import cp_model

from src.solver.problem import ProblemData


def add_soft_constraints_and_objective(
    model: cp_model.CpModel,
    assign: dict[tuple[int, int, int], cp_model.IntVar],
    teach: dict[tuple[int, int], cp_model.IntVar],
    problem: ProblemData,
) -> list[tuple[str, cp_model.IntVar]]:
    """Add soft constraints and build the objective function.

    Returns a list of (name, penalty_var) tuples for reporting scores.
    """
    penalties: list[tuple[str, cp_model.IntVar]] = []

    room_pref_penalty = _lecturer_room_preferences(model, assign, teach, problem)
    if room_pref_penalty is not None:
        penalties.append(("lecturer_room_preference", room_pref_penalty))

    time_pref_penalty = _lecturer_time_preferences(model, assign, teach, problem)
    if time_pref_penalty is not None:
        penalties.append(("lecturer_time_preference", time_pref_penalty))

    # Minimize total penalty
    if penalties:
        model.minimize(sum(var for _, var in penalties))

    return penalties


def _lecturer_room_preferences(
    model: cp_model.CpModel,
    assign: dict[tuple[int, int, int], cp_model.IntVar],
    teach: dict[tuple[int, int], cp_model.IntVar],
    problem: ProblemData,
) -> cp_model.IntVar | None:
    """SC1: Penalize when lecturers are not in their preferred rooms."""
    penalty_vars: list[cp_model.IntVar] = []

    # Pre-index assign vars by session
    assign_by_session: dict[int, list[tuple[int, int]]] = {}
    for (s_idx, r_idx, t_idx) in assign:
        assign_by_session.setdefault(s_idx, []).append((r_idx, t_idx))

    for l_idx, lecturer in enumerate(problem.lecturers):
        preferred_rooms = {
            problem.room_idx[rid]
            for rid in lecturer.preferred_room_ids
            if rid in problem.room_idx
        }
        if not preferred_rooms:
            continue

        for s_idx in problem.lecturer_sessions.get(l_idx, []):
            # Skip multi-lecturer sessions for v1
            if (s_idx, l_idx) in teach:
                continue
            for r_idx, t_idx in assign_by_session.get(s_idx, []):
                if r_idx not in preferred_rooms:
                    penalty_vars.append(assign[(s_idx, r_idx, t_idx)])

    if not penalty_vars:
        return None

    total = model.new_int_var(0, len(penalty_vars), "room_pref_penalty")
    model.add(total == sum(penalty_vars))
    return total


def _lecturer_time_preferences(
    model: cp_model.CpModel,
    assign: dict[tuple[int, int, int], cp_model.IntVar],
    teach: dict[tuple[int, int], cp_model.IntVar],
    problem: ProblemData,
) -> cp_model.IntVar | None:
    """SC2: Penalize when lecturers are scheduled outside preferred time slots."""
    penalty_vars: list[cp_model.IntVar] = []

    # Pre-index assign vars by session
    assign_by_session: dict[int, list[tuple[int, int]]] = {}
    for (s_idx, r_idx, t_idx) in assign:
        assign_by_session.setdefault(s_idx, []).append((r_idx, t_idx))

    for l_idx, lecturer in enumerate(problem.lecturers):
        preferred_slots = {
            problem.time_slot_idx[tsid]
            for tsid in lecturer.preferred_time_slot_ids
            if tsid in problem.time_slot_idx
        }
        if not preferred_slots:
            continue

        for s_idx in problem.lecturer_sessions.get(l_idx, []):
            # Skip multi-lecturer sessions for v1
            if (s_idx, l_idx) in teach:
                continue
            for r_idx, t_idx in assign_by_session.get(s_idx, []):
                if t_idx not in preferred_slots:
                    penalty_vars.append(assign[(s_idx, r_idx, t_idx)])

    if not penalty_vars:
        return None

    total = model.new_int_var(0, len(penalty_vars), "time_pref_penalty")
    model.add(total == sum(penalty_vars))
    return total
