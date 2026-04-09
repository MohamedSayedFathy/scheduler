"""Tests for the solver engine.

Covers all hard constraints and basic solving scenarios.
"""

from src.api.schemas import SolveRequest, SolveResultStatus
from src.solver.engine import solve


class TestSolverBasic:
    """Test basic solving scenarios."""

    def test_simple_problem_is_solvable(self, simple_problem: SolveRequest) -> None:
        """A single session with one valid room/time should always solve."""
        result = solve(simple_problem)
        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 1
        assert result.stats.status.value in ("OPTIMAL", "FEASIBLE")

    def test_simple_problem_assigns_correct_room(self, simple_problem: SolveRequest) -> None:
        """The only room available should be assigned."""
        result = solve(simple_problem)
        assert result.entries[0].room_id == simple_problem.rooms[0].id

    def test_simple_problem_assigns_correct_time_slot(self, simple_problem: SolveRequest) -> None:
        """The only time slot available should be assigned."""
        result = solve(simple_problem)
        assert simple_problem.time_slots[0].id in result.entries[0].time_slot_ids

    def test_multi_slot_problem_is_solvable(self, multi_slot_problem: SolveRequest) -> None:
        """Multiple sessions with enough rooms/slots should solve."""
        result = solve(multi_slot_problem)
        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 3


class TestHardConstraints:
    """Test that hard constraints are correctly enforced."""

    def test_no_room_double_booking(self, multi_slot_problem: SolveRequest) -> None:
        """No two entries should share the same room and time slot."""
        result = solve(multi_slot_problem)
        assert result.status == SolveResultStatus.SOLVED

        room_time_pairs: set[tuple[str, str]] = set()
        for entry in result.entries:
            for ts_id in entry.time_slot_ids:
                pair = (entry.room_id, ts_id)
                assert pair not in room_time_pairs, f"Room double-booked: {pair}"
                room_time_pairs.add(pair)

    def test_no_lecturer_double_booking(self, conflict_problem: SolveRequest) -> None:
        """Two sessions with the same lecturer and only one slot should be infeasible."""
        result = solve(conflict_problem)
        # With only 1 room and 1 time slot, 2 sessions for the same lecturer = infeasible
        assert result.status == SolveResultStatus.INFEASIBLE

    def test_room_capacity_respected(self, simple_problem: SolveRequest) -> None:
        """Sessions shouldn't be assigned to rooms too small for the student group."""
        # Make the room too small
        simple_problem.rooms[0].capacity = 5  # Group has 30 students
        result = solve(simple_problem)
        # No feasible room -> infeasible
        assert result.status == SolveResultStatus.INFEASIBLE

    def test_room_type_match(self, simple_problem: SolveRequest) -> None:
        """Lab sessions should only go to lab rooms."""
        # Change session to require a lab
        simple_problem.sessions[0].required_room_type = "lab"  # type: ignore[assignment]
        # Room is a lecture_hall -> no match
        result = solve(simple_problem)
        assert result.status == SolveResultStatus.INFEASIBLE


class TestSolverStats:
    """Test that solver statistics are correctly reported."""

    def test_stats_populated_on_success(self, simple_problem: SolveRequest) -> None:
        result = solve(simple_problem)
        assert result.stats.wall_time_seconds >= 0
        assert result.stats.num_branches >= 0
        assert result.stats.num_conflicts >= 0

    def test_stats_populated_on_infeasible(self, conflict_problem: SolveRequest) -> None:
        result = solve(conflict_problem)
        assert result.stats.wall_time_seconds >= 0
        assert result.stats.status.value == "INFEASIBLE"
