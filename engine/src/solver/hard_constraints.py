"""Hard constraints for the CP-SAT solver.

Every constraint in this module MUST be satisfied for a solution to be valid.
100% test coverage is required for this file.
"""

from collections import defaultdict

from ortools.sat.python import cp_model

from src.solver.problem import ProblemData


def add_hard_constraints(
    model: cp_model.CpModel,
    assign: dict[tuple[int, int, int], cp_model.IntVar],
    teach: dict[tuple[int, int], cp_model.IntVar],
    problem: ProblemData,
) -> None:
    """Apply all hard constraints to the model.

    Args:
        model: The CP-SAT model.
        assign: Decision variables dict.
        teach: Teaching variables dict (multi-lecturer sessions only).
        problem: Indexed problem data.
    """
    _each_session_assigned_once(model, assign, problem)
    _each_session_one_lecturer(model, teach, problem)
    _link_teach_to_assign(model, assign, teach, problem)
    _no_room_double_booking(model, assign, problem)
    _no_lecturer_double_booking(model, assign, teach, problem)
    _no_student_group_double_booking(model, assign, problem)


def _each_session_assigned_once(
    model: cp_model.CpModel,
    assign: dict[tuple[int, int, int], cp_model.IntVar],
    problem: ProblemData,
) -> None:
    """HC1: Every session must be scheduled in exactly one room at one time slot."""
    # Group assign vars by session for efficient lookup
    session_vars_map: defaultdict[int, list[cp_model.IntVar]] = defaultdict(list)
    for (s_idx, r_idx, t_idx), var in assign.items():
        session_vars_map[s_idx].append(var)

    for s_idx in range(len(problem.sessions)):
        session_vars = session_vars_map.get(s_idx, [])
        if session_vars:
            model.add(sum(session_vars) == 1)


def _each_session_one_lecturer(
    model: cp_model.CpModel,
    teach: dict[tuple[int, int], cp_model.IntVar],
    problem: ProblemData,
) -> None:
    """HC: For each multi-lecturer session, exactly one lecturer must be assigned."""
    # Group teach vars by session
    session_teach: defaultdict[int, list[cp_model.IntVar]] = defaultdict(list)
    for (s_idx, l_idx), var in teach.items():
        session_teach[s_idx].append(var)

    for s_idx, vars_list in session_teach.items():
        model.add(sum(vars_list) == 1)


def _link_teach_to_assign(
    model: cp_model.CpModel,
    assign: dict[tuple[int, int, int], cp_model.IntVar],
    teach: dict[tuple[int, int], cp_model.IntVar],
    problem: ProblemData,
) -> None:
    """HC: Link teach vars to assign vars — if lecturer l is NOT available at all
    occupied slots of assignment (s, r, t), then assign[s,r,t] + teach[s,l] <= 1."""
    if not teach:
        return

    # Pre-group assign vars by session
    assign_by_session: defaultdict[int, list[tuple[int, int]]] = defaultdict(list)
    for (s_idx, r_idx, t_idx) in assign:
        assign_by_session[s_idx].append((r_idx, t_idx))

    available = problem.lecturer_available_slots

    for (s_idx, l_idx), teach_var in teach.items():
        for r_idx, t_idx in assign_by_session.get(s_idx, []):
            occupied = problem.get_occupied_slots(s_idx, t_idx)
            if occupied is None:
                continue
            # Check if lecturer l is available at ALL occupied slots
            all_available = all(ot in available.get(l_idx, set()) for ot in occupied)
            if not all_available:
                model.add(assign[(s_idx, r_idx, t_idx)] + teach_var <= 1)


def _no_room_double_booking(
    model: cp_model.CpModel,
    assign: dict[tuple[int, int, int], cp_model.IntVar],
    problem: ProblemData,
) -> None:
    """HC2: No two sessions can be in the same room at the same time slot.

    Duration-aware: a session starting at t_start occupies all slots in its chain.
    """
    room_time_vars: defaultdict[tuple[int, int], list[cp_model.IntVar]] = defaultdict(list)

    for (s_idx, r_idx, t_start), var in assign.items():
        occupied = problem.get_occupied_slots(s_idx, t_start)
        if occupied is None:
            continue
        for ot in occupied:
            room_time_vars[(r_idx, ot)].append(var)

    for (r_idx, t_idx), vars_list in room_time_vars.items():
        if len(vars_list) > 1:
            model.add(sum(vars_list) <= 1)


def _no_lecturer_double_booking(
    model: cp_model.CpModel,
    assign: dict[tuple[int, int, int], cp_model.IntVar],
    teach: dict[tuple[int, int], cp_model.IntVar],
    problem: ProblemData,
) -> None:
    """HC3: No lecturer can be assigned to two sessions at the same time slot.

    Duration-aware and teach-aware:
    - Single-lecturer sessions: assign var directly blocks the lecturer.
    - Multi-lecturer sessions: use indicator = AND(teach[s,l], session_active_at_t).
    """
    # Pre-compute session_at_t: for each (s_idx, t_idx), list of assign vars
    # whose occupied chain includes t_idx
    session_at_t: defaultdict[tuple[int, int], list[cp_model.IntVar]] = defaultdict(list)
    for (s_idx, r_idx, t_start), var in assign.items():
        occupied = problem.get_occupied_slots(s_idx, t_start)
        if occupied is None:
            continue
        for ot in occupied:
            session_at_t[(s_idx, ot)].append(var)

    # Identify which sessions are in teach (multi-lecturer)
    teach_sessions: set[int] = {s_idx for (s_idx, _) in teach}

    # Find all time slots relevant to each lecturer (only slots where their sessions exist)
    lecturer_relevant_slots: defaultdict[int, set[int]] = defaultdict(set)
    for l_idx in range(len(problem.lecturers)):
        for s_idx in problem.lecturer_sessions.get(l_idx, []):
            for t_idx in range(len(problem.time_slots)):
                if (s_idx, t_idx) in session_at_t:
                    lecturer_relevant_slots[l_idx].add(t_idx)

    for l_idx in range(len(problem.lecturers)):
        lecturer_sessions = problem.lecturer_sessions.get(l_idx, [])
        if not lecturer_sessions:
            continue

        for t_idx in lecturer_relevant_slots.get(l_idx, set()):
            blocking_vars: list[cp_model.IntVar] = []

            for s_idx in lecturer_sessions:
                sat_vars = session_at_t.get((s_idx, t_idx))
                if not sat_vars:
                    continue

                if s_idx not in teach_sessions:
                    # Single-lecturer session: directly add assign vars
                    blocking_vars.extend(sat_vars)
                else:
                    # Multi-lecturer session: create indicator
                    # ind = AND(teach[s, l], sum(sat_vars) >= 1)
                    if (s_idx, l_idx) not in teach:
                        continue
                    sat_sum = sum(sat_vars)  # 0 or 1 (guaranteed by HC1)
                    ind = model.new_bool_var(f"lblock_s{s_idx}_l{l_idx}_t{t_idx}")
                    model.add(ind <= teach[(s_idx, l_idx)])
                    model.add(ind <= sat_sum)
                    model.add(ind >= teach[(s_idx, l_idx)] + sat_sum - 1)
                    blocking_vars.append(ind)

            if len(blocking_vars) > 1:
                model.add(sum(blocking_vars) <= 1)


def _no_student_group_double_booking(
    model: cp_model.CpModel,
    assign: dict[tuple[int, int, int], cp_model.IntVar],
    problem: ProblemData,
) -> None:
    """HC4: No student group can attend two sessions at the same time slot.

    Duration-aware: same expansion as HC2, keyed by (sg_idx, t_idx).
    """
    # Pre-index assign vars by session for O(1) lookup
    assign_by_session: defaultdict[int, list[tuple[int, int, cp_model.IntVar]]] = defaultdict(list)
    for (s_idx, r_idx, t_start), var in assign.items():
        assign_by_session[s_idx].append((r_idx, t_start, var))

    sg_time_vars: defaultdict[tuple[int, int], list[cp_model.IntVar]] = defaultdict(list)

    for sg_idx in range(len(problem.student_groups)):
        sg_sessions = problem.student_group_sessions.get(sg_idx, [])
        if len(sg_sessions) <= 1:
            continue

        for s_idx in sg_sessions:
            for r_idx, t_start, var in assign_by_session.get(s_idx, []):
                occupied = problem.get_occupied_slots(s_idx, t_start)
                if occupied is None:
                    continue
                for ot in occupied:
                    sg_time_vars[(sg_idx, ot)].append(var)

    for (sg_idx, t_idx), vars_list in sg_time_vars.items():
        if len(vars_list) > 1:
            model.add(sum(vars_list) <= 1)
