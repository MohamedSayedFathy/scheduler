"""Decision variable creation for the CP-SAT solver."""

from ortools.sat.python import cp_model

from src.solver.problem import ProblemData


def create_variables(
    model: cp_model.CpModel,
    problem: ProblemData,
) -> tuple[dict[tuple[int, int, int], cp_model.IntVar], dict[tuple[int, int], cp_model.IntVar]]:
    """Create decision variables for the timetabling problem.

    Primary variable:
        assign[s, r, t] = 1 if session s is assigned to room r starting at time_slot t

    Teaching variable (multi-lecturer only):
        teach[s, l] = 1 if lecturer l is the assigned teacher for session s

    Pre-filtering is applied: variables are only created where the assignment
    is potentially feasible (room type, capacity, equipment, duration, availability).

    Args:
        model: The CP-SAT model.
        problem: Indexed problem data.

    Returns:
        Tuple of (assign dict, teach dict).
    """
    assign: dict[tuple[int, int, int], cp_model.IntVar] = {}
    available = problem.lecturer_available_slots
    sessions_with_assign: set[int] = set()

    for s_idx in range(len(problem.sessions)):
        session = problem.sessions[s_idx]
        lecturers = problem.session_lecturers.get(s_idx, [])
        is_multi_lecturer = len(lecturers) > 1

        # Pre-compute allowed time slot indices
        allowed_t_indices: set[int] | None = None
        if session.allowed_time_slot_ids is not None:
            allowed_t_indices = {
                problem.time_slot_idx[ts_id]
                for ts_id in session.allowed_time_slot_ids
                if ts_id in problem.time_slot_idx
            }

        for r_idx in range(len(problem.rooms)):
            # Pre-filter: skip infeasible room assignments
            if not problem.is_feasible_assignment(s_idx, r_idx):
                continue

            # Only iterate over candidate time slots (allowed set or all)
            candidate_slots = (
                sorted(allowed_t_indices) if allowed_t_indices is not None
                else range(len(problem.time_slots))
            )

            for t_idx in candidate_slots:
                # Multi-slot: get occupied slots chain
                occupied = problem.get_occupied_slots(s_idx, t_idx)
                if occupied is None:
                    continue

                # For multi-slot, verify ALL occupied slots are in allowed set
                if allowed_t_indices is not None and len(occupied) > 1:
                    if not all(ot in allowed_t_indices for ot in occupied):
                        continue

                # Lecturer availability check across ALL occupied slots
                if is_multi_lecturer:
                    # Multi-lecturer (pool): ANY ONE lecturer must be available
                    # at ALL occupied slots
                    if not any(
                        all(ot in available.get(l, set()) for ot in occupied)
                        for l in lecturers
                    ):
                        continue
                else:
                    # Single lecturer (or no lecturer): ALL occupied slots must
                    # have the single lecturer available
                    if not all(
                        all(ot in available.get(l_idx, set()) for ot in occupied)
                        for l_idx in lecturers
                    ):
                        continue

                var_name = f"assign_s{s_idx}_r{r_idx}_t{t_idx}"
                assign[(s_idx, r_idx, t_idx)] = model.new_bool_var(var_name)
                sessions_with_assign.add(s_idx)

    # Create teach variables for multi-lecturer sessions that have assign vars
    teach: dict[tuple[int, int], cp_model.IntVar] = {}
    for s_idx in range(len(problem.sessions)):
        lecturers = problem.session_lecturers.get(s_idx, [])
        if len(lecturers) > 1 and s_idx in sessions_with_assign:
            for l_idx in lecturers:
                teach[(s_idx, l_idx)] = model.new_bool_var(f"teach_s{s_idx}_l{l_idx}")

    return assign, teach
