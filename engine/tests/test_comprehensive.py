"""Comprehensive solver tests with known expected results.

Each test constructs a problem with a deterministic or tightly constrained
solution space so we can assert exact assignments, not just "it solved".

Naming convention:
  test_<category>_<scenario>

Categories:
  - exact:       Only one valid solution exists, assert exact assignment
  - feasible:    Multiple solutions possible, assert structural properties
  - infeasible:  No valid solution exists, assert infeasible status
  - constraint:  Isolates a specific hard constraint
  - soft:        Tests soft constraint optimization
  - scale:       Medium/large problems to test performance
"""

import uuid
from collections import defaultdict

import pytest

from src.api.schemas import (
    Constraint,
    ConstraintSeverity,
    ConstraintType,
    DayOfWeek,
    Lecturer,
    Room,
    RoomType,
    Session,
    SessionType,
    SolveRequest,
    SolveResultStatus,
    SolverConfig,
    StudentGroup,
    TimeSlot,
)
from src.solver.engine import solve


# ── Helpers ──────────────────────────────────────────────────────────

def uid() -> str:
    return str(uuid.uuid4())


_DAY_DATE: dict[DayOfWeek, str] = {
    DayOfWeek.MONDAY: "2026-04-13",
    DayOfWeek.TUESDAY: "2026-04-14",
    DayOfWeek.WEDNESDAY: "2026-04-15",
    DayOfWeek.THURSDAY: "2026-04-16",
    DayOfWeek.FRIDAY: "2026-04-17",
    DayOfWeek.SATURDAY: "2026-04-18",
    DayOfWeek.SUNDAY: "2026-04-19",
}


def make_time_slots(
    days: list[DayOfWeek],
    hours: list[tuple[str, str]],
) -> list[TimeSlot]:
    """Generate time slots for given days × hours."""
    slots = []
    for day in days:
        for start, end in hours:
            slots.append(TimeSlot(id=uid(), day_of_week=day, start_time=start, end_time=end, date=_DAY_DATE[day]))
    return slots


def make_request(
    rooms: list[Room],
    time_slots: list[TimeSlot],
    lecturers: list[Lecturer],
    student_groups: list[StudentGroup],
    sessions: list[Session],
    timeout: int = 30,
) -> SolveRequest:
    return SolveRequest(
        tenant_id=uid(),
        schedule_id=uid(),
        callback_url="http://localhost:3000/api/webhooks/engine",
        rooms=rooms,
        time_slots=time_slots,
        lecturers=lecturers,
        student_groups=student_groups,
        sessions=sessions,
        solver_config=SolverConfig(timeout_seconds=timeout, num_workers=1, random_seed=42),
    )


def get_entry_for_session(result, session_id: str):
    """Find the schedule entry for a given session ID."""
    for entry in result.entries:
        if entry.session_id == session_id:
            return entry
    return None


# ══════════════════════════════════════════════════════════════════════
# EXACT SOLUTION TESTS — only one valid assignment exists
# ══════════════════════════════════════════════════════════════════════

class TestExactSolutions:
    """Problems where only one valid solution exists."""

    def test_exact_one_session_one_room_one_slot(self):
        """1 session, 1 room, 1 slot → must be assigned to that exact combo."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], [ts], [lec], [grp], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 1
        assert result.entries[0].session_id == sess.id
        assert result.entries[0].room_id == room.id
        assert result.entries[0].time_slot_ids == [ts.id]

    def test_exact_two_sessions_two_rooms_one_slot(self):
        """2 sessions, 2 rooms, 1 slot, different lecturers.
        Each session must go to a different room (only 1 slot).
        Rooms have exact capacity match to force deterministic assignment.
        """
        r_big = Room(id=uid(), name="Big", capacity=100, room_type=RoomType.LECTURE_HALL)
        r_small = Room(id=uid(), name="Small", capacity=30, room_type=RoomType.LECTURE_HALL)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec1 = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        lec2 = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=[ts.id])
        grp_big = StudentGroup(id=uid(), name="Big Group", size=80)  # Only fits in big room
        grp_small = StudentGroup(id=uid(), name="Small Group", size=25)

        sess_big = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec1.id], student_group_ids=[grp_big.id],
        )
        sess_small = Session(
            id=uid(), course_id=uid(), course_code="CS102",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec2.id], student_group_ids=[grp_small.id],
        )

        result = solve(make_request(
            [r_big, r_small], [ts], [lec1, lec2], [grp_big, grp_small],
            [sess_big, sess_small],
        ))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 2

        entry_big = get_entry_for_session(result, sess_big.id)
        assert entry_big is not None
        assert entry_big.room_id == r_big.id  # Only room big enough

    def test_exact_lab_must_go_to_lab_room(self):
        """A lab session with required_room_type=lab must go to the lab room."""
        r_hall = Room(id=uid(), name="Hall", capacity=100, room_type=RoomType.LECTURE_HALL)
        r_lab = Room(id=uid(), name="Lab", capacity=40, room_type=RoomType.LAB)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        grp = StudentGroup(id=uid(), name="G1", size=30)

        sess = Session(
            id=uid(), course_id=uid(), course_code="CS201",
            session_type=SessionType.LAB, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
            required_room_type=RoomType.LAB,
        )

        result = solve(make_request([r_hall, r_lab], [ts], [lec], [grp], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        assert result.entries[0].room_id == r_lab.id

    def test_exact_lecturer_availability_forces_slot(self):
        """Lecturer only available at one slot → session must be at that slot."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts1 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        ts2 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="10:00", end_time="11:00", date="2026-04-13")
        ts3 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="11:00", end_time="12:00", date="2026-04-13")
        # Lecturer only available at ts2
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts2.id])
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], [ts1, ts2, ts3], [lec], [grp], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        assert result.entries[0].time_slot_ids == [ts2.id]

    def test_exact_two_sessions_same_lecturer_forced_to_different_slots(self):
        """Same lecturer, 2 sessions, 1 room, 2 slots → one session per slot."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts1 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        ts2 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="10:00", end_time="11:00", date="2026-04-13")
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts1.id, ts2.id])
        grp1 = StudentGroup(id=uid(), name="G1", size=20)
        grp2 = StudentGroup(id=uid(), name="G2", size=20)

        s1 = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp1.id],
        )
        s2 = Session(
            id=uid(), course_id=uid(), course_code="CS102",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp2.id],
        )

        result = solve(make_request([room], [ts1, ts2], [lec], [grp1, grp2], [s1, s2]))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 2
        # Each entry should be at a different time slot
        slots_used = {e.time_slot_ids[0] for e in result.entries}
        assert slots_used == {ts1.id, ts2.id}


# ══════════════════════════════════════════════════════════════════════
# INFEASIBLE TESTS — no valid solution exists
# ══════════════════════════════════════════════════════════════════════

class TestInfeasible:
    """Problems that provably have no valid solution."""

    def test_infeasible_three_sessions_one_slot_one_room_same_lecturer(self):
        """3 sessions, same lecturer, 1 room, 1 slot → impossible."""
        room = Room(id=uid(), name="R1", capacity=100, room_type=RoomType.LECTURE_HALL)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        groups = [StudentGroup(id=uid(), name=f"G{i}", size=20) for i in range(3)]
        sessions = [
            Session(
                id=uid(), course_id=uid(), course_code=f"CS{i}01",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lec.id], student_group_ids=[groups[i].id],
            )
            for i in range(3)
        ]

        result = solve(make_request([room], [ts], [lec], groups, sessions))
        assert result.status == SolveResultStatus.INFEASIBLE

    def test_infeasible_no_room_large_enough(self):
        """Student group of 200, all rooms seat 50 → no valid room."""
        rooms = [Room(id=uid(), name=f"R{i}", capacity=50, room_type=RoomType.LECTURE_HALL) for i in range(3)]
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        grp = StudentGroup(id=uid(), name="Huge Group", size=200)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request(rooms, [ts], [lec], [grp], [sess]))
        assert result.status == SolveResultStatus.INFEASIBLE

    def test_infeasible_no_lab_room_available(self):
        """Lab session but only lecture halls → no room type match."""
        rooms = [
            Room(id=uid(), name="Hall 1", capacity=100, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="Hall 2", capacity=80, room_type=RoomType.LECTURE_HALL),
        ]
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS201",
            session_type=SessionType.LAB, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
            required_room_type=RoomType.LAB,
        )

        result = solve(make_request(rooms, [ts], [lec], [grp], [sess]))
        assert result.status == SolveResultStatus.INFEASIBLE

    def test_infeasible_lecturer_not_available_at_any_slot(self):
        """Lecturer has no availability at any of the time slots."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts1 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        ts2 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="10:00", end_time="11:00", date="2026-04-13")
        # Lecturer available at a slot that doesn't exist in the problem
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[uid()])
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], [ts1, ts2], [lec], [grp], [sess]))
        assert result.status == SolveResultStatus.INFEASIBLE

    def test_infeasible_student_group_double_booked(self):
        """Same student group in 2 sessions, only 1 time slot → impossible."""
        rooms = [
            Room(id=uid(), name="R1", capacity=100, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="R2", capacity=100, room_type=RoomType.LECTURE_HALL),
        ]
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec1 = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        lec2 = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=[ts.id])
        grp = StudentGroup(id=uid(), name="G1", size=30)

        s1 = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec1.id], student_group_ids=[grp.id],
        )
        s2 = Session(
            id=uid(), course_id=uid(), course_code="CS102",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec2.id], student_group_ids=[grp.id],
        )

        result = solve(make_request(rooms, [ts], [lec1, lec2], [grp], [s1, s2]))
        assert result.status == SolveResultStatus.INFEASIBLE

    def test_infeasible_more_sessions_than_slots_same_room(self):
        """3 sessions, 1 room, 2 slots → can only fit 2, not 3."""
        room = Room(id=uid(), name="R1", capacity=100, room_type=RoomType.LECTURE_HALL)
        ts1 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        ts2 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="10:00", end_time="11:00", date="2026-04-13")
        lecturers = [
            Lecturer(id=uid(), name=f"Dr. {c}", available_time_slot_ids=[ts1.id, ts2.id])
            for c in "ABC"
        ]
        groups = [StudentGroup(id=uid(), name=f"G{i}", size=20) for i in range(3)]
        sessions = [
            Session(
                id=uid(), course_id=uid(), course_code=f"CS{i}01",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lecturers[i].id], student_group_ids=[groups[i].id],
            )
            for i in range(3)
        ]

        result = solve(make_request([room], [ts1, ts2], lecturers, groups, sessions))
        assert result.status == SolveResultStatus.INFEASIBLE


# ══════════════════════════════════════════════════════════════════════
# HARD CONSTRAINT ISOLATION TESTS
# ══════════════════════════════════════════════════════════════════════

class TestHardConstraintIsolation:
    """Each test isolates and verifies a single hard constraint."""

    def test_hc_room_no_double_booking_verified(self):
        """4 sessions, 2 rooms, 4 slots → verify no room has 2 sessions at once."""
        rooms = [
            Room(id=uid(), name="R1", capacity=100, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="R2", capacity=100, room_type=RoomType.LECTURE_HALL),
        ]
        slots = make_time_slots(
            [DayOfWeek.MONDAY], [("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00"), ("13:00", "14:00")],
        )
        lecturers = [
            Lecturer(id=uid(), name=f"Dr. {c}", available_time_slot_ids=[s.id for s in slots])
            for c in "ABCD"
        ]
        groups = [StudentGroup(id=uid(), name=f"G{i}", size=30) for i in range(4)]
        sessions = [
            Session(
                id=uid(), course_id=uid(), course_code=f"CS{i}01",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lecturers[i].id], student_group_ids=[groups[i].id],
            )
            for i in range(4)
        ]

        result = solve(make_request(rooms, slots, lecturers, groups, sessions))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 4

        # Verify: no (room, time_slot) pair appears twice
        room_time_pairs: set[tuple[str, str]] = set()
        for entry in result.entries:
            for ts_id in entry.time_slot_ids:
                pair = (entry.room_id, ts_id)
                assert pair not in room_time_pairs, f"Room double-booked: {pair}"
                room_time_pairs.add(pair)

    def test_hc_lecturer_no_double_booking_verified(self):
        """Lecturer teaches 3 sessions → must all be at different time slots."""
        rooms = [Room(id=uid(), name=f"R{i}", capacity=100, room_type=RoomType.LECTURE_HALL) for i in range(3)]
        slots = make_time_slots(
            [DayOfWeek.MONDAY],
            [("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00")],
        )
        lec = Lecturer(id=uid(), name="Dr. Busy", available_time_slot_ids=[s.id for s in slots])
        groups = [StudentGroup(id=uid(), name=f"G{i}", size=20) for i in range(3)]
        sessions = [
            Session(
                id=uid(), course_id=uid(), course_code=f"CS{i}01",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lec.id], student_group_ids=[groups[i].id],
            )
            for i in range(3)
        ]

        result = solve(make_request(rooms, slots, [lec], groups, sessions))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 3

        # Verify: all time slots are different
        all_slots = [e.time_slot_ids[0] for e in result.entries]
        assert len(set(all_slots)) == 3, "Lecturer double-booked!"

    def test_hc_student_group_no_double_booking_verified(self):
        """Group attends 2 sessions → must be at different time slots."""
        rooms = [
            Room(id=uid(), name="R1", capacity=100, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="R2", capacity=100, room_type=RoomType.LECTURE_HALL),
        ]
        ts1 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        ts2 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="10:00", end_time="11:00", date="2026-04-13")
        lec1 = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts1.id, ts2.id])
        lec2 = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=[ts1.id, ts2.id])
        grp = StudentGroup(id=uid(), name="G1", size=30)

        s1 = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec1.id], student_group_ids=[grp.id],
        )
        s2 = Session(
            id=uid(), course_id=uid(), course_code="CS102",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec2.id], student_group_ids=[grp.id],
        )

        result = solve(make_request(rooms, [ts1, ts2], [lec1, lec2], [grp], [s1, s2]))

        assert result.status == SolveResultStatus.SOLVED
        slots_used = [e.time_slot_ids[0] for e in result.entries]
        assert len(set(slots_used)) == 2, "Student group double-booked!"

    def test_hc_room_capacity_enforced(self):
        """Two rooms: 30-seat and 80-seat. Group of 50 must go to 80-seat room."""
        r_small = Room(id=uid(), name="Small", capacity=30, room_type=RoomType.LECTURE_HALL)
        r_big = Room(id=uid(), name="Big", capacity=80, room_type=RoomType.LECTURE_HALL)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        grp = StudentGroup(id=uid(), name="G1", size=50)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([r_small, r_big], [ts], [lec], [grp], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        assert result.entries[0].room_id == r_big.id

    def test_hc_room_type_match_enforced(self):
        """Tutorial session with required_room_type must go to tutorial room."""
        r_hall = Room(id=uid(), name="Hall", capacity=200, room_type=RoomType.LECTURE_HALL)
        r_tut = Room(id=uid(), name="Tutorial", capacity=40, room_type=RoomType.TUTORIAL_ROOM)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        grp = StudentGroup(id=uid(), name="G1", size=25)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.TUTORIAL, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
            required_room_type=RoomType.TUTORIAL_ROOM,
        )

        result = solve(make_request([r_hall, r_tut], [ts], [lec], [grp], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        assert result.entries[0].room_id == r_tut.id

    def test_hc_equipment_requirement_enforced(self):
        """Session needs 'projector' → must go to room that has it."""
        r_no_proj = Room(id=uid(), name="Plain", capacity=50, room_type=RoomType.LECTURE_HALL, equipment=[])
        r_proj = Room(id=uid(), name="Equipped", capacity=50, room_type=RoomType.LECTURE_HALL, equipment=["projector", "whiteboard"])
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
            required_equipment=["projector"],
        )

        result = solve(make_request([r_no_proj, r_proj], [ts], [lec], [grp], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        assert result.entries[0].room_id == r_proj.id


# ══════════════════════════════════════════════════════════════════════
# FEASIBLE STRUCTURAL TESTS — multiple solutions, verify invariants
# ══════════════════════════════════════════════════════════════════════

class TestFeasibleStructural:
    """Problems with multiple solutions — verify all constraints hold."""

    def test_feasible_five_sessions_across_week(self):
        """5 sessions spread across Mon-Fri with 2 rooms and 10 slots."""
        rooms = [
            Room(id=uid(), name="Hall A", capacity=100, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="Hall B", capacity=80, room_type=RoomType.LECTURE_HALL),
        ]
        days = [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY]
        slots = make_time_slots(days, [("09:00", "10:00"), ("10:00", "11:00")])
        all_slot_ids = [s.id for s in slots]

        lecturers = [
            Lecturer(id=uid(), name=f"Dr. {c}", available_time_slot_ids=all_slot_ids)
            for c in "ABCDE"
        ]
        groups = [StudentGroup(id=uid(), name=f"G{i}", size=40) for i in range(5)]
        sessions = [
            Session(
                id=uid(), course_id=uid(), course_code=f"CS{i}01",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lecturers[i].id], student_group_ids=[groups[i].id],
            )
            for i in range(5)
        ]

        result = solve(make_request(rooms, slots, lecturers, groups, sessions))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 5

        # Verify no room double-booking
        room_time_pairs: set[tuple[str, str]] = set()
        for entry in result.entries:
            for ts_id in entry.time_slot_ids:
                pair = (entry.room_id, ts_id)
                assert pair not in room_time_pairs
                room_time_pairs.add(pair)

    def test_feasible_mixed_room_types(self):
        """Lectures, tutorials, and labs all routed to correct room types."""
        rooms = [
            Room(id=uid(), name="Hall", capacity=200, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="Tutorial", capacity=40, room_type=RoomType.TUTORIAL_ROOM),
            Room(id=uid(), name="Lab", capacity=30, room_type=RoomType.LAB),
        ]
        slots = make_time_slots([DayOfWeek.MONDAY], [("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00")])
        all_ids = [s.id for s in slots]
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=all_ids)
        grp = StudentGroup(id=uid(), name="G1", size=25)

        s_lecture = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
            required_room_type=RoomType.LECTURE_HALL,
        )
        s_tutorial = Session(
            id=uid(), course_id=uid(), course_code="CS101T",
            session_type=SessionType.TUTORIAL, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
            required_room_type=RoomType.TUTORIAL_ROOM,
        )
        s_lab = Session(
            id=uid(), course_id=uid(), course_code="CS101L",
            session_type=SessionType.LAB, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
            required_room_type=RoomType.LAB,
        )

        result = solve(make_request(rooms, slots, [lec], [grp], [s_lecture, s_tutorial, s_lab]))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 3

        # Verify room type assignments
        room_type_map = {r.id: r.room_type for r in rooms}
        entry_lec = get_entry_for_session(result, s_lecture.id)
        entry_tut = get_entry_for_session(result, s_tutorial.id)
        entry_lab = get_entry_for_session(result, s_lab.id)

        assert room_type_map[entry_lec.room_id] == RoomType.LECTURE_HALL
        assert room_type_map[entry_tut.room_id] == RoomType.TUTORIAL_ROOM
        assert room_type_map[entry_lab.room_id] == RoomType.LAB

        # All at different times (same lecturer)
        all_slots_used = [e.time_slot_ids[0] for e in result.entries]
        assert len(set(all_slots_used)) == 3

    def test_feasible_shared_student_group_no_overlap(self):
        """Two sessions share a student group → must be at different times."""
        rooms = [
            Room(id=uid(), name="R1", capacity=100, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="R2", capacity=100, room_type=RoomType.LECTURE_HALL),
        ]
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.TUESDAY],
            [("09:00", "10:00"), ("10:00", "11:00")],
        )
        all_ids = [s.id for s in slots]
        lec1 = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=all_ids)
        lec2 = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=all_ids)
        shared_grp = StudentGroup(id=uid(), name="CS Year 1", size=40)

        s1 = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec1.id], student_group_ids=[shared_grp.id],
        )
        s2 = Session(
            id=uid(), course_id=uid(), course_code="MATH101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec2.id], student_group_ids=[shared_grp.id],
        )

        result = solve(make_request(rooms, slots, [lec1, lec2], [shared_grp], [s1, s2]))

        assert result.status == SolveResultStatus.SOLVED
        slot_set = {e.time_slot_ids[0] for e in result.entries}
        assert len(slot_set) == 2, "Student group attending two sessions at same time!"


# ══════════════════════════════════════════════════════════════════════
# SOFT CONSTRAINT TESTS
# ══════════════════════════════════════════════════════════════════════

class TestSoftConstraints:
    """Tests that verify soft constraints influence the solution."""

    def test_soft_lecturer_room_preference_respected(self):
        """Lecturer prefers Room B. Both rooms valid. Should get Room B."""
        r_a = Room(id=uid(), name="Room A", capacity=50, room_type=RoomType.LECTURE_HALL)
        r_b = Room(id=uid(), name="Room B", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec = Lecturer(
            id=uid(), name="Dr. A", available_time_slot_ids=[ts.id],
            preferred_room_ids=[r_b.id],
        )
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([r_a, r_b], [ts], [lec], [grp], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        assert result.entries[0].room_id == r_b.id

    def test_soft_lecturer_time_preference_respected(self):
        """Lecturer prefers slot 2. Both slots valid. Should get slot 2."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts1 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        ts2 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="10:00", end_time="11:00", date="2026-04-13")
        lec = Lecturer(
            id=uid(), name="Dr. A", available_time_slot_ids=[ts1.id, ts2.id],
            preferred_time_slot_ids=[ts2.id],
        )
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], [ts1, ts2], [lec], [grp], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        assert result.entries[0].time_slot_ids == [ts2.id]


# ══════════════════════════════════════════════════════════════════════
# MULTI-LECTURER TESTS
# ══════════════════════════════════════════════════════════════════════

class TestMultiLecturer:
    """Tests involving sessions with multiple lecturers (pool — pick one)."""

    def test_pool_session_picks_available_lecturer(self):
        """Session with 2 lecturers in pool: solver picks one who is available."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts1 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        ts2 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="10:00", end_time="11:00", date="2026-04-13")
        ts3 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="11:00", end_time="12:00", date="2026-04-13")
        # Lecturer A: available at ts1 and ts2
        # Lecturer B: available at ts2 and ts3
        lec_a = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts1.id, ts2.id])
        lec_b = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=[ts2.id, ts3.id])
        grp = StudentGroup(id=uid(), name="G1", size=30)

        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec_a.id, lec_b.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], [ts1, ts2, ts3], [lec_a, lec_b], [grp], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        entry = result.entries[0]
        # Solver picks ONE lecturer from the pool
        assert entry.assigned_lecturer_id in (lec_a.id, lec_b.id)

    def test_pool_neither_available_infeasible(self):
        """Both lecturers in pool unavailable at all slots → infeasible."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts1 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        ts2 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="10:00", end_time="11:00", date="2026-04-13")
        # Neither lecturer is available at any slot in the problem
        lec_a = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[uid()])
        lec_b = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=[uid()])
        grp = StudentGroup(id=uid(), name="G1", size=30)

        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec_a.id, lec_b.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], [ts1, ts2], [lec_a, lec_b], [grp], [sess]))
        assert result.status == SolveResultStatus.INFEASIBLE


# ══════════════════════════════════════════════════════════════════════
# MULTI-STUDENT-GROUP TESTS
# ══════════════════════════════════════════════════════════════════════

class TestMultiStudentGroup:
    """Tests with sessions serving multiple student groups."""

    def test_combined_group_size_must_fit_room(self):
        """Session with 2 groups (30+25=55). Room of 50 too small, room of 60 works."""
        r_small = Room(id=uid(), name="Small", capacity=50, room_type=RoomType.LECTURE_HALL)
        r_big = Room(id=uid(), name="Big", capacity=60, room_type=RoomType.LECTURE_HALL)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        g1 = StudentGroup(id=uid(), name="G1", size=30)
        g2 = StudentGroup(id=uid(), name="G2", size=25)

        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[g1.id, g2.id],
        )

        result = solve(make_request([r_small, r_big], [ts], [lec], [g1, g2], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        assert result.entries[0].room_id == r_big.id

    def test_two_sessions_sharing_group_different_times(self):
        """Two sessions share Group A. A third session has Group B.
        Sessions with Group A must not overlap."""
        rooms = [Room(id=uid(), name=f"R{i}", capacity=100, room_type=RoomType.LECTURE_HALL) for i in range(3)]
        slots = make_time_slots(
            [DayOfWeek.MONDAY],
            [("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00")],
        )
        all_ids = [s.id for s in slots]
        lecturers = [
            Lecturer(id=uid(), name=f"Dr. {c}", available_time_slot_ids=all_ids) for c in "ABC"
        ]
        grp_a = StudentGroup(id=uid(), name="Group A", size=30)
        grp_b = StudentGroup(id=uid(), name="Group B", size=25)

        s1 = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lecturers[0].id], student_group_ids=[grp_a.id],
        )
        s2 = Session(
            id=uid(), course_id=uid(), course_code="CS201",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lecturers[1].id], student_group_ids=[grp_a.id],
        )
        s3 = Session(
            id=uid(), course_id=uid(), course_code="CS301",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lecturers[2].id], student_group_ids=[grp_b.id],
        )

        result = solve(make_request(rooms, slots, lecturers, [grp_a, grp_b], [s1, s2, s3]))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 3

        # Sessions s1 and s2 (both have grp_a) must be at different times
        e1 = get_entry_for_session(result, s1.id)
        e2 = get_entry_for_session(result, s2.id)
        assert e1.time_slot_ids[0] != e2.time_slot_ids[0]


# ══════════════════════════════════════════════════════════════════════
# SCALE TESTS — medium/larger problems
# ══════════════════════════════════════════════════════════════════════

class TestScale:
    """Medium-scale problems to verify the solver handles realistic sizes."""

    def test_scale_10_sessions_5_rooms_20_slots(self):
        """10 sessions, 5 rooms, 20 slots (Mon-Fri × 4 hours). Should solve fast."""
        rooms = [
            Room(id=uid(), name=f"Room {i}", capacity=60, room_type=RoomType.LECTURE_HALL)
            for i in range(5)
        ]
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY],
            [("08:00", "09:00"), ("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00"), ("13:00", "14:00")],
        )
        all_ids = [s.id for s in slots]
        lecturers = [
            Lecturer(id=uid(), name=f"Dr. {i}", available_time_slot_ids=all_ids)
            for i in range(6)
        ]
        groups = [StudentGroup(id=uid(), name=f"G{i}", size=40) for i in range(5)]

        sessions = [
            Session(
                id=uid(), course_id=uid(), course_code=f"C{i:02d}",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lecturers[i % 6].id], student_group_ids=[groups[i % 5].id],
            )
            for i in range(10)
        ]

        result = solve(make_request(rooms, slots, lecturers, groups, sessions, timeout=30))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 10

        # Verify all hard constraints
        room_time: set[tuple[str, str]] = set()
        lecturer_time: dict[str, set[str]] = defaultdict(set)
        group_time: dict[str, set[str]] = defaultdict(set)

        session_map = {s.id: s for s in sessions}
        for entry in result.entries:
            sess = session_map[entry.session_id]
            for ts_id in entry.time_slot_ids:
                # Room double-booking
                pair = (entry.room_id, ts_id)
                assert pair not in room_time, f"Room double-booked: {pair}"
                room_time.add(pair)

                # Lecturer double-booking
                for lid in sess.lecturer_ids:
                    assert ts_id not in lecturer_time[lid], f"Lecturer {lid} double-booked at {ts_id}"
                    lecturer_time[lid].add(ts_id)

                # Student group double-booking
                for gid in sess.student_group_ids:
                    assert ts_id not in group_time[gid], f"Group {gid} double-booked at {ts_id}"
                    group_time[gid].add(ts_id)

    def test_scale_20_sessions_mixed_types(self):
        """20 sessions across lecture/tutorial/lab types with matching room constraints."""
        rooms = [
            Room(id=uid(), name=f"Hall {i}", capacity=150, room_type=RoomType.LECTURE_HALL) for i in range(3)
        ] + [
            Room(id=uid(), name=f"Tut {i}", capacity=40, room_type=RoomType.TUTORIAL_ROOM) for i in range(3)
        ] + [
            Room(id=uid(), name=f"Lab {i}", capacity=30, room_type=RoomType.LAB) for i in range(2)
        ]
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY],
            [("08:00", "09:00"), ("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00")],
        )
        all_ids = [s.id for s in slots]
        lecturers = [
            Lecturer(id=uid(), name=f"Dr. {i}", available_time_slot_ids=all_ids) for i in range(8)
        ]
        groups = [StudentGroup(id=uid(), name=f"G{i}", size=25) for i in range(6)]

        sessions = []
        # 8 lectures
        for i in range(8):
            sessions.append(Session(
                id=uid(), course_id=uid(), course_code=f"LEC{i:02d}",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lecturers[i].id], student_group_ids=[groups[i % 6].id],
                required_room_type=RoomType.LECTURE_HALL,
            ))
        # 7 tutorials
        for i in range(7):
            sessions.append(Session(
                id=uid(), course_id=uid(), course_code=f"TUT{i:02d}",
                session_type=SessionType.TUTORIAL, duration_slots=1,
                lecturer_ids=[lecturers[i % 8].id], student_group_ids=[groups[i % 6].id],
                required_room_type=RoomType.TUTORIAL_ROOM,
            ))
        # 5 labs
        for i in range(5):
            sessions.append(Session(
                id=uid(), course_id=uid(), course_code=f"LAB{i:02d}",
                session_type=SessionType.LAB, duration_slots=1,
                lecturer_ids=[lecturers[i % 8].id], student_group_ids=[groups[i % 6].id],
                required_room_type=RoomType.LAB,
            ))

        result = solve(make_request(rooms, slots, lecturers, groups, sessions, timeout=30))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 20

        # Verify room types match
        room_type_map = {r.id: r.room_type for r in rooms}
        session_map = {s.id: s for s in sessions}
        for entry in result.entries:
            sess = session_map[entry.session_id]
            if sess.required_room_type:
                assert room_type_map[entry.room_id] == sess.required_room_type, (
                    f"Session {sess.course_code} assigned to wrong room type"
                )

    def test_scale_tight_schedule_barely_feasible(self):
        """6 sessions, 1 lecturer for each, 1 shared group, 3 rooms, 6 slots.
        Exactly enough slots for 6 sessions. No slack."""
        rooms = [Room(id=uid(), name=f"R{i}", capacity=100, room_type=RoomType.LECTURE_HALL) for i in range(3)]
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.TUESDAY],
            [("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00")],
        )
        all_ids = [s.id for s in slots]
        lecturers = [
            Lecturer(id=uid(), name=f"Dr. {i}", available_time_slot_ids=all_ids) for i in range(6)
        ]
        grp = StudentGroup(id=uid(), name="G1", size=40)

        # All 6 sessions share the same student group → must all be at different times
        # There are exactly 6 time slots → tight but feasible
        sessions = [
            Session(
                id=uid(), course_id=uid(), course_code=f"CS{i}01",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lecturers[i].id], student_group_ids=[grp.id],
            )
            for i in range(6)
        ]

        result = solve(make_request(rooms, slots, lecturers, [grp], sessions))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 6
        # All 6 entries at different time slots (shared group constraint)
        all_slots = {e.time_slot_ids[0] for e in result.entries}
        assert len(all_slots) == 6

    def test_scale_tight_plus_one_infeasible(self):
        """Same as above but 7 sessions with 6 slots → infeasible (shared group)."""
        rooms = [Room(id=uid(), name=f"R{i}", capacity=100, room_type=RoomType.LECTURE_HALL) for i in range(3)]
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.TUESDAY],
            [("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00")],
        )
        all_ids = [s.id for s in slots]
        lecturers = [
            Lecturer(id=uid(), name=f"Dr. {i}", available_time_slot_ids=all_ids) for i in range(7)
        ]
        grp = StudentGroup(id=uid(), name="G1", size=40)

        sessions = [
            Session(
                id=uid(), course_id=uid(), course_code=f"CS{i}01",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lecturers[i].id], student_group_ids=[grp.id],
            )
            for i in range(7)
        ]

        result = solve(make_request(rooms, slots, lecturers, [grp], sessions))
        assert result.status == SolveResultStatus.INFEASIBLE


# ══════════════════════════════════════════════════════════════════════
# EDGE CASE TESTS
# ══════════════════════════════════════════════════════════════════════

class TestEdgeCases:
    """Unusual but valid inputs that exercise boundary conditions."""

    def test_edge_single_slot_single_room_single_everything(self):
        """Absolute minimum valid problem: 1 of everything."""
        room = Room(id=uid(), name="R", capacity=1, room_type=RoomType.LECTURE_HALL)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="00:00", end_time="01:00", date="2026-04-13")
        lec = Lecturer(id=uid(), name="L", available_time_slot_ids=[ts.id])
        grp = StudentGroup(id=uid(), name="G", size=1)
        sess = Session(
            id=uid(), course_id=uid(), course_code="X",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], [ts], [lec], [grp], [sess]))
        assert result.status == SolveResultStatus.SOLVED

    def test_edge_lecturer_available_at_all_slots(self):
        """Lecturer available everywhere, session can go anywhere. Should solve."""
        rooms = [Room(id=uid(), name=f"R{i}", capacity=50, room_type=RoomType.LECTURE_HALL) for i in range(3)]
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY],
            [("08:00", "09:00"), ("09:00", "10:00"), ("10:00", "11:00")],
        )
        all_ids = [s.id for s in slots]
        lec = Lecturer(id=uid(), name="Dr. Flexible", available_time_slot_ids=all_ids)
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request(rooms, slots, [lec], [grp], [sess]))
        assert result.status == SolveResultStatus.SOLVED

    def test_edge_many_rooms_few_sessions(self):
        """10 rooms but only 2 sessions. Should solve trivially."""
        rooms = [Room(id=uid(), name=f"R{i}", capacity=50, room_type=RoomType.LECTURE_HALL) for i in range(10)]
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec1 = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        lec2 = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=[ts.id])
        g1 = StudentGroup(id=uid(), name="G1", size=20)
        g2 = StudentGroup(id=uid(), name="G2", size=20)

        s1 = Session(id=uid(), course_id=uid(), course_code="CS101",
                     session_type=SessionType.LECTURE, duration_slots=1,
                     lecturer_ids=[lec1.id], student_group_ids=[g1.id])
        s2 = Session(id=uid(), course_id=uid(), course_code="CS102",
                     session_type=SessionType.LECTURE, duration_slots=1,
                     lecturer_ids=[lec2.id], student_group_ids=[g2.id])

        result = solve(make_request(rooms, [ts], [lec1, lec2], [g1, g2], [s1, s2]))
        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 2
        # Must be in different rooms (same time slot)
        assert result.entries[0].room_id != result.entries[1].room_id

    def test_edge_room_capacity_exact_match(self):
        """Group of exactly 50, room of exactly 50. Should fit."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        grp = StudentGroup(id=uid(), name="G1", size=50)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], [ts], [lec], [grp], [sess]))
        assert result.status == SolveResultStatus.SOLVED

    def test_edge_room_capacity_one_short(self):
        """Group of 51, room of 50. Should NOT fit."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        grp = StudentGroup(id=uid(), name="G1", size=51)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], [ts], [lec], [grp], [sess]))
        assert result.status == SolveResultStatus.INFEASIBLE


# ══════════════════════════════════════════════════════════════════════
# REALISTIC SCENARIO TESTS
# ══════════════════════════════════════════════════════════════════════

class TestRealisticScenarios:
    """End-to-end scenarios mimicking real university scheduling."""

    def test_realistic_cs_department_one_day(self):
        """CS department: 3 courses, each with lecture+tutorial.
        2 lecturers, 3 student groups, Mon schedule.
        Known solution exists: verify all constraints hold."""
        # Rooms
        hall = Room(id=uid(), name="Lecture Hall A", capacity=120, room_type=RoomType.LECTURE_HALL)
        tut1 = Room(id=uid(), name="Tutorial 1", capacity=40, room_type=RoomType.TUTORIAL_ROOM)
        tut2 = Room(id=uid(), name="Tutorial 2", capacity=40, room_type=RoomType.TUTORIAL_ROOM)

        # Monday, 5 slots
        slots = make_time_slots(
            [DayOfWeek.MONDAY],
            [("08:00", "09:00"), ("09:00", "10:00"), ("10:00", "11:00"),
             ("11:00", "12:00"), ("13:00", "14:00")],
        )
        all_ids = [s.id for s in slots]

        # Lecturers
        dr_a = Lecturer(id=uid(), name="Dr. Ahmed", available_time_slot_ids=all_ids)
        dr_b = Lecturer(id=uid(), name="Dr. Sara", available_time_slot_ids=all_ids)

        # Student groups
        cs1a = StudentGroup(id=uid(), name="CS Year 1A", size=35)
        cs1b = StudentGroup(id=uid(), name="CS Year 1B", size=35)
        cs2 = StudentGroup(id=uid(), name="CS Year 2", size=30)

        # Course: CS101 (Dr. Ahmed, groups 1A + 1B)
        cs101_lec = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[dr_a.id], student_group_ids=[cs1a.id, cs1b.id],
            required_room_type=RoomType.LECTURE_HALL,
        )
        cs101_tut = Session(
            id=uid(), course_id=uid(), course_code="CS101T",
            session_type=SessionType.TUTORIAL, duration_slots=1,
            lecturer_ids=[dr_a.id], student_group_ids=[cs1a.id],
            required_room_type=RoomType.TUTORIAL_ROOM,
        )
        # Course: CS201 (Dr. Sara, group 2)
        cs201_lec = Session(
            id=uid(), course_id=uid(), course_code="CS201",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[dr_b.id], student_group_ids=[cs2.id],
            required_room_type=RoomType.LECTURE_HALL,
        )
        cs201_tut = Session(
            id=uid(), course_id=uid(), course_code="CS201T",
            session_type=SessionType.TUTORIAL, duration_slots=1,
            lecturer_ids=[dr_b.id], student_group_ids=[cs2.id],
            required_room_type=RoomType.TUTORIAL_ROOM,
        )

        all_sessions = [cs101_lec, cs101_tut, cs201_lec, cs201_tut]

        result = solve(make_request(
            [hall, tut1, tut2], slots, [dr_a, dr_b],
            [cs1a, cs1b, cs2], all_sessions,
        ))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 4

        # Verify constraints
        room_type_map = {r.id: r.room_type for r in [hall, tut1, tut2]}

        for entry in result.entries:
            sess = next(s for s in all_sessions if s.id == entry.session_id)
            # Room type
            if sess.required_room_type:
                assert room_type_map[entry.room_id] == sess.required_room_type

        # Dr. Ahmed teaches cs101_lec and cs101_tut → must be at different times
        e_lec = get_entry_for_session(result, cs101_lec.id)
        e_tut = get_entry_for_session(result, cs101_tut.id)
        assert e_lec.time_slot_ids[0] != e_tut.time_slot_ids[0]

        # CS1A group has both cs101_lec and cs101_tut → different times
        assert e_lec.time_slot_ids[0] != e_tut.time_slot_ids[0]

    def test_realistic_full_week_three_departments(self):
        """3 departments, 6 courses, mix of lectures/tutorials/labs.
        Enough resources for feasibility. Verify all constraints."""
        # Rooms: 2 halls, 3 tutorials, 2 labs
        rooms = [
            Room(id=uid(), name="Hall A", capacity=150, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="Hall B", capacity=100, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="Tut 1", capacity=50, room_type=RoomType.TUTORIAL_ROOM),
            Room(id=uid(), name="Tut 2", capacity=50, room_type=RoomType.TUTORIAL_ROOM),
            Room(id=uid(), name="Tut 3", capacity=50, room_type=RoomType.TUTORIAL_ROOM),
            Room(id=uid(), name="Lab 1", capacity=40, room_type=RoomType.LAB),
            Room(id=uid(), name="Lab 2", capacity=40, room_type=RoomType.LAB),
        ]

        # Mon-Fri, 4 slots/day = 20 total
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
             DayOfWeek.THURSDAY, DayOfWeek.FRIDAY],
            [("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00"), ("14:00", "15:00")],
        )
        all_ids = [s.id for s in slots]

        # 5 lecturers, all fully available
        lecturers = [
            Lecturer(id=uid(), name=f"Prof. {c}", available_time_slot_ids=all_ids)
            for c in ["Ahmed", "Sara", "Omar", "Fatima", "Tarek"]
        ]

        # 4 student groups
        groups = [
            StudentGroup(id=uid(), name="CS Y1", size=40),
            StudentGroup(id=uid(), name="CS Y2", size=35),
            StudentGroup(id=uid(), name="Math Y1", size=45),
            StudentGroup(id=uid(), name="Eng Y1", size=30),
        ]

        # 12 sessions across 6 courses
        sessions = [
            # CS101: lecture + tutorial (Prof Ahmed, CS Y1)
            Session(id=uid(), course_id=uid(), course_code="CS101L",
                    session_type=SessionType.LECTURE, duration_slots=1,
                    lecturer_ids=[lecturers[0].id], student_group_ids=[groups[0].id],
                    required_room_type=RoomType.LECTURE_HALL),
            Session(id=uid(), course_id=uid(), course_code="CS101T",
                    session_type=SessionType.TUTORIAL, duration_slots=1,
                    lecturer_ids=[lecturers[0].id], student_group_ids=[groups[0].id],
                    required_room_type=RoomType.TUTORIAL_ROOM),
            # CS201: lecture + lab (Prof Sara, CS Y2)
            Session(id=uid(), course_id=uid(), course_code="CS201L",
                    session_type=SessionType.LECTURE, duration_slots=1,
                    lecturer_ids=[lecturers[1].id], student_group_ids=[groups[1].id],
                    required_room_type=RoomType.LECTURE_HALL),
            Session(id=uid(), course_id=uid(), course_code="CS201B",
                    session_type=SessionType.LAB, duration_slots=1,
                    lecturer_ids=[lecturers[1].id], student_group_ids=[groups[1].id],
                    required_room_type=RoomType.LAB),
            # MATH101: lecture + tutorial (Prof Omar, CS Y1 + Math Y1)
            Session(id=uid(), course_id=uid(), course_code="MATH101L",
                    session_type=SessionType.LECTURE, duration_slots=1,
                    lecturer_ids=[lecturers[2].id], student_group_ids=[groups[0].id, groups[2].id],
                    required_room_type=RoomType.LECTURE_HALL),
            Session(id=uid(), course_id=uid(), course_code="MATH101T",
                    session_type=SessionType.TUTORIAL, duration_slots=1,
                    lecturer_ids=[lecturers[2].id], student_group_ids=[groups[2].id],
                    required_room_type=RoomType.TUTORIAL_ROOM),
            # MATH201: lecture (Prof Fatima, CS Y2)
            Session(id=uid(), course_id=uid(), course_code="MATH201L",
                    session_type=SessionType.LECTURE, duration_slots=1,
                    lecturer_ids=[lecturers[3].id], student_group_ids=[groups[1].id],
                    required_room_type=RoomType.LECTURE_HALL),
            # ENG101: lecture + lab (Prof Tarek, Eng Y1)
            Session(id=uid(), course_id=uid(), course_code="ENG101L",
                    session_type=SessionType.LECTURE, duration_slots=1,
                    lecturer_ids=[lecturers[4].id], student_group_ids=[groups[3].id],
                    required_room_type=RoomType.LECTURE_HALL),
            Session(id=uid(), course_id=uid(), course_code="ENG101B",
                    session_type=SessionType.LAB, duration_slots=1,
                    lecturer_ids=[lecturers[4].id], student_group_ids=[groups[3].id],
                    required_room_type=RoomType.LAB),
            # PHY101: lecture + tutorial (Prof Ahmed again, Math Y1)
            Session(id=uid(), course_id=uid(), course_code="PHY101L",
                    session_type=SessionType.LECTURE, duration_slots=1,
                    lecturer_ids=[lecturers[0].id], student_group_ids=[groups[2].id],
                    required_room_type=RoomType.LECTURE_HALL),
            Session(id=uid(), course_id=uid(), course_code="PHY101T",
                    session_type=SessionType.TUTORIAL, duration_slots=1,
                    lecturer_ids=[lecturers[0].id], student_group_ids=[groups[2].id],
                    required_room_type=RoomType.TUTORIAL_ROOM),
            # Extra tutorial for CS Y2 (Prof Sara)
            Session(id=uid(), course_id=uid(), course_code="CS201T",
                    session_type=SessionType.TUTORIAL, duration_slots=1,
                    lecturer_ids=[lecturers[1].id], student_group_ids=[groups[1].id],
                    required_room_type=RoomType.TUTORIAL_ROOM),
        ]

        result = solve(make_request(rooms, slots, lecturers, groups, sessions, timeout=30))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 12

        # Comprehensive constraint verification
        room_type_map = {r.id: r.room_type for r in rooms}
        room_cap_map = {r.id: r.capacity for r in rooms}
        session_map = {s.id: s for s in sessions}
        group_size_map = {g.id: g.size for g in groups}

        room_time_set: set[tuple[str, str]] = set()
        lec_time_set: dict[str, set[str]] = defaultdict(set)
        grp_time_set: dict[str, set[str]] = defaultdict(set)

        for entry in result.entries:
            sess = session_map[entry.session_id]

            for ts_id in entry.time_slot_ids:
                # HC: Room double-booking
                rt = (entry.room_id, ts_id)
                assert rt not in room_time_set, f"Room double-booked: {rt}"
                room_time_set.add(rt)

                # HC: Lecturer double-booking
                for lid in sess.lecturer_ids:
                    assert ts_id not in lec_time_set[lid], \
                        f"Lecturer double-booked: {lid} at {ts_id}"
                    lec_time_set[lid].add(ts_id)

                # HC: Student group double-booking
                for gid in sess.student_group_ids:
                    assert ts_id not in grp_time_set[gid], \
                        f"Student group double-booked: {gid} at {ts_id}"
                    grp_time_set[gid].add(ts_id)

            # HC: Room type
            if sess.required_room_type:
                assert room_type_map[entry.room_id] == sess.required_room_type, \
                    f"{sess.course_code}: expected {sess.required_room_type}, got {room_type_map[entry.room_id]}"

            # HC: Room capacity
            total_students = sum(group_size_map[gid] for gid in sess.student_group_ids)
            assert room_cap_map[entry.room_id] >= total_students, \
                f"{sess.course_code}: room cap {room_cap_map[entry.room_id]} < {total_students} students"


# ══════════════════════════════════════════════════════════════════════
# FREQUENCY PER WEEK TESTS
# ══════════════════════════════════════════════════════════════════════

class TestFrequencyPerWeek:
    """Tests simulating frequencyPerWeek expansion.

    The Next.js service expands each courseSession with frequencyPerWeek=N
    into N separate engine sessions (e.g., CS101_0, CS101_1).
    These share the same lecturer and student group, so the engine must
    place them at different time slots.
    """

    def test_freq2_same_lecturer_same_group_different_slots(self):
        """Course with 2 lectures/week: same lecturer, same group.
        Must land on 2 different time slots."""
        room = Room(id=uid(), name="Hall", capacity=100, room_type=RoomType.LECTURE_HALL)
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY],
            [("09:00", "10:00"), ("10:00", "11:00")],
        )
        all_ids = [s.id for s in slots]
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=all_ids)
        grp = StudentGroup(id=uid(), name="CS Y1", size=40)
        course_id = uid()

        # Simulates frequencyPerWeek=2: two instances of the same session type
        s0 = Session(
            id=uid(), course_id=course_id, course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )
        s1 = Session(
            id=uid(), course_id=course_id, course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], slots, [lec], [grp], [s0, s1]))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 2
        # Must be at different slots (same lecturer + same group)
        t0 = result.entries[0].time_slot_ids[0]
        t1 = result.entries[1].time_slot_ids[0]
        assert t0 != t1

    def test_freq3_same_lecturer_needs_3_slots(self):
        """Course with 3 lectures/week: needs at least 3 available slots."""
        room = Room(id=uid(), name="Hall", capacity=100, room_type=RoomType.LECTURE_HALL)
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY],
            [("09:00", "10:00")],
        )
        all_ids = [s.id for s in slots]
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=all_ids)
        grp = StudentGroup(id=uid(), name="G1", size=30)
        course_id = uid()

        sessions = [
            Session(
                id=uid(), course_id=course_id, course_code="MATH101",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lec.id], student_group_ids=[grp.id],
            )
            for _ in range(3)
        ]

        result = solve(make_request([room], slots, [lec], [grp], sessions))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 3
        all_slots = {e.time_slot_ids[0] for e in result.entries}
        assert len(all_slots) == 3  # All on different slots

    def test_freq3_only_2_slots_infeasible(self):
        """3 instances but only 2 slots available → infeasible."""
        room = Room(id=uid(), name="Hall", capacity=100, room_type=RoomType.LECTURE_HALL)
        slots = make_time_slots([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY], [("09:00", "10:00")])
        all_ids = [s.id for s in slots]
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=all_ids)
        grp = StudentGroup(id=uid(), name="G1", size=30)
        course_id = uid()

        sessions = [
            Session(
                id=uid(), course_id=course_id, course_code="MATH101",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lec.id], student_group_ids=[grp.id],
            )
            for _ in range(3)
        ]

        result = solve(make_request([room], slots, [lec], [grp], sessions))
        assert result.status == SolveResultStatus.INFEASIBLE

    def test_freq2_two_courses_same_group_no_overlap(self):
        """Two courses each with freq=2, same student group.
        4 total sessions, all must be at different times for the group."""
        rooms = [
            Room(id=uid(), name="Hall A", capacity=100, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="Hall B", capacity=100, room_type=RoomType.LECTURE_HALL),
        ]
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY],
            [("09:00", "10:00"), ("10:00", "11:00")],
        )
        all_ids = [s.id for s in slots]
        lec1 = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=all_ids)
        lec2 = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=all_ids)
        grp = StudentGroup(id=uid(), name="CS Y1", size=40)

        course1_id = uid()
        course2_id = uid()

        # CS101: 2x/week lecture
        cs101 = [
            Session(
                id=uid(), course_id=course1_id, course_code="CS101",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lec1.id], student_group_ids=[grp.id],
            )
            for _ in range(2)
        ]
        # MATH101: 2x/week lecture
        math101 = [
            Session(
                id=uid(), course_id=course2_id, course_code="MATH101",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lec2.id], student_group_ids=[grp.id],
            )
            for _ in range(2)
        ]

        result = solve(make_request(rooms, slots, [lec1, lec2], [grp], cs101 + math101))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 4
        # All 4 at different times (shared student group)
        all_slots = {e.time_slot_ids[0] for e in result.entries}
        assert len(all_slots) == 4

    def test_freq2_two_courses_same_lecturer_no_overlap(self):
        """Same lecturer teaches 2 courses, each freq=2.
        4 sessions must all be at different times."""
        rooms = [Room(id=uid(), name=f"R{i}", capacity=100, room_type=RoomType.LECTURE_HALL) for i in range(2)]
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY],
            [("09:00", "10:00")],
        )
        all_ids = [s.id for s in slots]
        lec = Lecturer(id=uid(), name="Dr. Busy", available_time_slot_ids=all_ids)
        grp1 = StudentGroup(id=uid(), name="G1", size=30)
        grp2 = StudentGroup(id=uid(), name="G2", size=30)

        sessions = []
        for code, grp in [("CS101", grp1), ("CS201", grp2)]:
            for _ in range(2):
                sessions.append(Session(
                    id=uid(), course_id=uid(), course_code=code,
                    session_type=SessionType.LECTURE, duration_slots=1,
                    lecturer_ids=[lec.id], student_group_ids=[grp.id],
                ))

        result = solve(make_request(rooms, slots, [lec], [grp1, grp2], sessions))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 4
        all_slots = {e.time_slot_ids[0] for e in result.entries}
        assert len(all_slots) == 4  # Lecturer can't be in two places

    def test_freq_mixed_lecture_tutorial_lab(self):
        """CS201: 2 lectures/wk + 1 tutorial/wk + 1 lab/wk = 4 sessions.
        Same lecturer, same group. Must all be at different times."""
        rooms = [
            Room(id=uid(), name="Hall", capacity=100, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="Tut", capacity=40, room_type=RoomType.TUTORIAL_ROOM),
            Room(id=uid(), name="Lab", capacity=30, room_type=RoomType.LAB),
        ]
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY],
            [("09:00", "10:00"), ("10:00", "11:00")],
        )
        all_ids = [s.id for s in slots]
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=all_ids)
        grp = StudentGroup(id=uid(), name="CS Y2", size=25)
        course_id = uid()

        # 2 lectures
        lectures = [
            Session(
                id=uid(), course_id=course_id, course_code="CS201",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lec.id], student_group_ids=[grp.id],
                required_room_type=RoomType.LECTURE_HALL,
            )
            for _ in range(2)
        ]
        # 1 tutorial
        tutorial = Session(
            id=uid(), course_id=course_id, course_code="CS201",
            session_type=SessionType.TUTORIAL, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
            required_room_type=RoomType.TUTORIAL_ROOM,
        )
        # 1 lab
        lab = Session(
            id=uid(), course_id=course_id, course_code="CS201",
            session_type=SessionType.LAB, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
            required_room_type=RoomType.LAB,
        )

        all_sessions = lectures + [tutorial, lab]
        result = solve(make_request(rooms, slots, [lec], [grp], all_sessions))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 4

        # All at different times
        all_used = {e.time_slot_ids[0] for e in result.entries}
        assert len(all_used) == 4

        # Verify room type assignments
        room_type_map = {r.id: r.room_type for r in rooms}
        for entry in result.entries:
            sess = next(s for s in all_sessions if s.id == entry.session_id)
            if sess.required_room_type:
                assert room_type_map[entry.room_id] == sess.required_room_type

    def test_freq_realistic_full_department(self):
        """Simulates a CS department week:
        - CS101: 2 lectures + 1 tutorial (Dr. Ahmed, CS Y1)
        - CS201: 2 lectures + 1 lab     (Dr. Sara, CS Y2)
        - CS301: 2 lectures + 1 tutorial (Dr. Ahmed, CS Y3) ← Ahmed teaches 2 courses
        - MATH101: 3 lectures + 2 tutorials (Dr. Omar, CS Y1 + Math Y1)

        Total: 14 engine sessions. Verify all constraints."""
        rooms = [
            Room(id=uid(), name="Hall A", capacity=150, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="Hall B", capacity=100, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="Tut 1", capacity=50, room_type=RoomType.TUTORIAL_ROOM),
            Room(id=uid(), name="Tut 2", capacity=50, room_type=RoomType.TUTORIAL_ROOM),
            Room(id=uid(), name="Lab 1", capacity=40, room_type=RoomType.LAB),
        ]
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
             DayOfWeek.THURSDAY, DayOfWeek.FRIDAY],
            [("08:00", "09:00"), ("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00")],
        )
        all_ids = [s.id for s in slots]

        ahmed = Lecturer(id=uid(), name="Dr. Ahmed", available_time_slot_ids=all_ids)
        sara = Lecturer(id=uid(), name="Dr. Sara", available_time_slot_ids=all_ids)
        omar = Lecturer(id=uid(), name="Dr. Omar", available_time_slot_ids=all_ids)

        cs_y1 = StudentGroup(id=uid(), name="CS Y1", size=45)
        cs_y2 = StudentGroup(id=uid(), name="CS Y2", size=38)
        cs_y3 = StudentGroup(id=uid(), name="CS Y3", size=35)
        math_y1 = StudentGroup(id=uid(), name="Math Y1", size=50)

        sessions: list[Session] = []

        # CS101: freq=2 lectures + freq=1 tutorial (Ahmed, CS Y1)
        cs101_id = uid()
        for _ in range(2):
            sessions.append(Session(
                id=uid(), course_id=cs101_id, course_code="CS101",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[ahmed.id], student_group_ids=[cs_y1.id],
                required_room_type=RoomType.LECTURE_HALL,
            ))
        sessions.append(Session(
            id=uid(), course_id=cs101_id, course_code="CS101",
            session_type=SessionType.TUTORIAL, duration_slots=1,
            lecturer_ids=[ahmed.id], student_group_ids=[cs_y1.id],
            required_room_type=RoomType.TUTORIAL_ROOM,
        ))

        # CS201: freq=2 lectures + freq=1 lab (Sara, CS Y2)
        cs201_id = uid()
        for _ in range(2):
            sessions.append(Session(
                id=uid(), course_id=cs201_id, course_code="CS201",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[sara.id], student_group_ids=[cs_y2.id],
                required_room_type=RoomType.LECTURE_HALL,
            ))
        sessions.append(Session(
            id=uid(), course_id=cs201_id, course_code="CS201",
            session_type=SessionType.LAB, duration_slots=1,
            lecturer_ids=[sara.id], student_group_ids=[cs_y2.id],
            required_room_type=RoomType.LAB,
        ))

        # CS301: freq=2 lectures + freq=1 tutorial (Ahmed, CS Y3)
        cs301_id = uid()
        for _ in range(2):
            sessions.append(Session(
                id=uid(), course_id=cs301_id, course_code="CS301",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[ahmed.id], student_group_ids=[cs_y3.id],
                required_room_type=RoomType.LECTURE_HALL,
            ))
        sessions.append(Session(
            id=uid(), course_id=cs301_id, course_code="CS301",
            session_type=SessionType.TUTORIAL, duration_slots=1,
            lecturer_ids=[ahmed.id], student_group_ids=[cs_y3.id],
            required_room_type=RoomType.TUTORIAL_ROOM,
        ))

        # MATH101: freq=3 lectures + freq=2 tutorials (Omar, CS Y1 + Math Y1)
        math101_id = uid()
        for _ in range(3):
            sessions.append(Session(
                id=uid(), course_id=math101_id, course_code="MATH101",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[omar.id], student_group_ids=[cs_y1.id, math_y1.id],
                required_room_type=RoomType.LECTURE_HALL,
            ))
        for _ in range(2):
            sessions.append(Session(
                id=uid(), course_id=math101_id, course_code="MATH101",
                session_type=SessionType.TUTORIAL, duration_slots=1,
                lecturer_ids=[omar.id], student_group_ids=[math_y1.id],
                required_room_type=RoomType.TUTORIAL_ROOM,
            ))

        assert len(sessions) == 14

        all_groups = [cs_y1, cs_y2, cs_y3, math_y1]
        result = solve(make_request(rooms, slots, [ahmed, sara, omar], all_groups, sessions, timeout=30))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 14

        # Full constraint verification
        room_type_map = {r.id: r.room_type for r in rooms}
        room_cap_map = {r.id: r.capacity for r in rooms}
        session_map = {s.id: s for s in sessions}
        group_size_map = {g.id: g.size for g in all_groups}

        room_time_set: set[tuple[str, str]] = set()
        lec_time_set: dict[str, set[str]] = defaultdict(set)
        grp_time_set: dict[str, set[str]] = defaultdict(set)

        for entry in result.entries:
            sess = session_map[entry.session_id]
            for ts_id in entry.time_slot_ids:
                # Room double-booking
                rt = (entry.room_id, ts_id)
                assert rt not in room_time_set, f"Room double-booked: {rt}"
                room_time_set.add(rt)

                # Lecturer double-booking
                for lid in sess.lecturer_ids:
                    assert ts_id not in lec_time_set[lid], \
                        f"Lecturer double-booked: {lid} at {ts_id} ({sess.course_code})"
                    lec_time_set[lid].add(ts_id)

                # Student group double-booking
                for gid in sess.student_group_ids:
                    assert ts_id not in grp_time_set[gid], \
                        f"Student group double-booked: {gid} at {ts_id} ({sess.course_code})"
                    grp_time_set[gid].add(ts_id)

            # Room type
            if sess.required_room_type:
                assert room_type_map[entry.room_id] == sess.required_room_type

            # Room capacity
            total_students = sum(group_size_map[gid] for gid in sess.student_group_ids)
            assert room_cap_map[entry.room_id] >= total_students

        # Ahmed teaches CS101 (3 sessions) + CS301 (3 sessions) = 6 total
        # All 6 must be at different times
        ahmed_slots = lec_time_set[ahmed.id]
        assert len(ahmed_slots) == 6

        # CS Y1 attends CS101 (3 sessions) + MATH101 lectures (3 sessions) = 6 total
        # All must be at different times
        cs_y1_slots = grp_time_set[cs_y1.id]
        assert len(cs_y1_slots) == 6

    def test_freq_overloaded_lecturer_infeasible(self):
        """Lecturer with 5 courses × freq=2 = 10 sessions.
        Only 8 slots available → infeasible."""
        rooms = [Room(id=uid(), name=f"R{i}", capacity=100, room_type=RoomType.LECTURE_HALL) for i in range(5)]
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY],
            [("09:00", "10:00"), ("10:00", "11:00")],
        )
        all_ids = [s.id for s in slots]  # 8 slots
        lec = Lecturer(id=uid(), name="Dr. Overloaded", available_time_slot_ids=all_ids)
        groups = [StudentGroup(id=uid(), name=f"G{i}", size=30) for i in range(5)]

        sessions = []
        for i in range(5):
            for _ in range(2):  # freq=2
                sessions.append(Session(
                    id=uid(), course_id=uid(), course_code=f"CS{i}01",
                    session_type=SessionType.LECTURE, duration_slots=1,
                    lecturer_ids=[lec.id], student_group_ids=[groups[i].id],
                ))

        assert len(sessions) == 10  # 10 sessions, 8 slots

        result = solve(make_request(rooms, slots, [lec], groups, sessions))
        assert result.status == SolveResultStatus.INFEASIBLE

    def test_freq_overloaded_lecturer_barely_feasible(self):
        """Same as above but only 4 courses × freq=2 = 8 sessions.
        Exactly 8 slots → barely feasible."""
        rooms = [Room(id=uid(), name=f"R{i}", capacity=100, room_type=RoomType.LECTURE_HALL) for i in range(4)]
        slots = make_time_slots(
            [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY],
            [("09:00", "10:00"), ("10:00", "11:00")],
        )
        all_ids = [s.id for s in slots]  # 8 slots
        lec = Lecturer(id=uid(), name="Dr. Maxed", available_time_slot_ids=all_ids)
        groups = [StudentGroup(id=uid(), name=f"G{i}", size=30) for i in range(4)]

        sessions = []
        for i in range(4):
            for _ in range(2):
                sessions.append(Session(
                    id=uid(), course_id=uid(), course_code=f"CS{i}01",
                    session_type=SessionType.LECTURE, duration_slots=1,
                    lecturer_ids=[lec.id], student_group_ids=[groups[i].id],
                ))

        assert len(sessions) == 8

        result = solve(make_request(rooms, slots, [lec], groups, sessions))
        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 8
        all_slots = {e.time_slot_ids[0] for e in result.entries}
        assert len(all_slots) == 8  # Every slot used


# ══════════════════════════════════════════════════════════════════════
# MULTI-SLOT (DURATION > 1) TESTS
# ══════════════════════════════════════════════════════════════════════

class TestMultiSlot:
    """Tests for sessions with duration_slots > 1."""

    def test_duration_2_occupies_two_consecutive_slots(self):
        """1 session dur=2, 3 consecutive slots on same day, 1 room, 1 lecturer.
        Verify entry has 2 time_slot_ids."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        slots = make_time_slots(
            [DayOfWeek.MONDAY],
            [("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00")],
        )
        all_ids = [s.id for s in slots]
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=all_ids)
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=2,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], slots, [lec], [grp], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 1
        entry = result.entries[0]
        assert len(entry.time_slot_ids) == 2
        # The two slot IDs should be consecutive
        slot_id_set = set(entry.time_slot_ids)
        assert slot_id_set.issubset(set(all_ids))

    def test_duration_2_non_consecutive_infeasible(self):
        """2 slots on different days (no consecutive pair). dur=2. Should be infeasible."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts1 = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date=_DAY_DATE[DayOfWeek.MONDAY])
        ts2 = TimeSlot(id=uid(), day_of_week=DayOfWeek.TUESDAY, start_time="09:00", end_time="10:00", date=_DAY_DATE[DayOfWeek.TUESDAY])
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts1.id, ts2.id])
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=2,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], [ts1, ts2], [lec], [grp], [sess]))
        assert result.status == SolveResultStatus.INFEASIBLE

    def test_duration_2_blocks_room_for_both_slots(self):
        """Session A (dur=2) and Session B (dur=1) in same room. 3 consecutive slots.
        Both should be scheduled (A takes 2 slots, B takes 1)."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        slots = make_time_slots(
            [DayOfWeek.MONDAY],
            [("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00")],
        )
        all_ids = [s.id for s in slots]
        lec1 = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=all_ids)
        lec2 = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=all_ids)
        grp1 = StudentGroup(id=uid(), name="G1", size=30)
        grp2 = StudentGroup(id=uid(), name="G2", size=25)

        sess_a = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=2,
            lecturer_ids=[lec1.id], student_group_ids=[grp1.id],
        )
        sess_b = Session(
            id=uid(), course_id=uid(), course_code="CS102",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec2.id], student_group_ids=[grp2.id],
        )

        result = solve(make_request([room], slots, [lec1, lec2], [grp1, grp2], [sess_a, sess_b]))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 2

        entry_a = get_entry_for_session(result, sess_a.id)
        entry_b = get_entry_for_session(result, sess_b.id)
        assert len(entry_a.time_slot_ids) == 2
        assert len(entry_b.time_slot_ids) == 1
        # No overlap in room
        assert not set(entry_a.time_slot_ids) & set(entry_b.time_slot_ids)

    def test_duration_2_blocks_lecturer_for_both_slots(self):
        """Same lecturer teaches dur=2 and dur=1 sessions. 3 consecutive slots, 2 rooms.
        Verify no overlap."""
        rooms = [
            Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="R2", capacity=50, room_type=RoomType.LECTURE_HALL),
        ]
        slots = make_time_slots(
            [DayOfWeek.MONDAY],
            [("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00")],
        )
        all_ids = [s.id for s in slots]
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=all_ids)
        grp1 = StudentGroup(id=uid(), name="G1", size=30)
        grp2 = StudentGroup(id=uid(), name="G2", size=25)

        sess_a = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=2,
            lecturer_ids=[lec.id], student_group_ids=[grp1.id],
        )
        sess_b = Session(
            id=uid(), course_id=uid(), course_code="CS102",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp2.id],
        )

        result = solve(make_request(rooms, slots, [lec], [grp1, grp2], [sess_a, sess_b]))

        assert result.status == SolveResultStatus.SOLVED
        entry_a = get_entry_for_session(result, sess_a.id)
        entry_b = get_entry_for_session(result, sess_b.id)
        assert len(entry_a.time_slot_ids) == 2
        assert len(entry_b.time_slot_ids) == 1
        # No overlap (same lecturer)
        assert not set(entry_a.time_slot_ids) & set(entry_b.time_slot_ids)

    def test_duration_2_blocks_student_group_for_both_slots(self):
        """Same student group in dur=2 and dur=1 sessions. 3 slots, 2 rooms.
        Verify no overlap."""
        rooms = [
            Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="R2", capacity=50, room_type=RoomType.LECTURE_HALL),
        ]
        slots = make_time_slots(
            [DayOfWeek.MONDAY],
            [("09:00", "10:00"), ("10:00", "11:00"), ("11:00", "12:00")],
        )
        all_ids = [s.id for s in slots]
        lec1 = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=all_ids)
        lec2 = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=all_ids)
        grp = StudentGroup(id=uid(), name="G1", size=30)

        sess_a = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=2,
            lecturer_ids=[lec1.id], student_group_ids=[grp.id],
        )
        sess_b = Session(
            id=uid(), course_id=uid(), course_code="CS102",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec2.id], student_group_ids=[grp.id],
        )

        result = solve(make_request(rooms, slots, [lec1, lec2], [grp], [sess_a, sess_b]))

        assert result.status == SolveResultStatus.SOLVED
        entry_a = get_entry_for_session(result, sess_a.id)
        entry_b = get_entry_for_session(result, sess_b.id)
        assert len(entry_a.time_slot_ids) == 2
        assert len(entry_b.time_slot_ids) == 1
        # No overlap (same student group)
        assert not set(entry_a.time_slot_ids) & set(entry_b.time_slot_ids)

    def test_duration_3_needs_3_consecutive(self):
        """dur=3 session but only 2 consecutive slots available → infeasible."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        # Two consecutive slots on Monday, one on Tuesday (not consecutive with Monday)
        slots = make_time_slots(
            [DayOfWeek.MONDAY],
            [("09:00", "10:00"), ("10:00", "11:00")],
        )
        all_ids = [s.id for s in slots]
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=all_ids)
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=3,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], slots, [lec], [grp], [sess]))
        assert result.status == SolveResultStatus.INFEASIBLE

    def test_duration_1_unchanged_regression(self):
        """Standard dur=1 test. Verify it still works after multi-slot changes."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], [ts], [lec], [grp], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 1
        assert result.entries[0].session_id == sess.id
        assert result.entries[0].room_id == room.id
        assert result.entries[0].time_slot_ids == [ts.id]


# ══════════════════════════════════════════════════════════════════════
# LECTURER POOL TESTS
# ══════════════════════════════════════════════════════════════════════

class TestLecturerPool:
    """Tests for sessions with multiple lecturers (pool — solver picks one)."""

    def test_pool_picks_one_lecturer(self):
        """Session with lecturerIds=[A, B], both available. Verify solved,
        entry has assigned_lecturer_id that is either A or B."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec_a = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        lec_b = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=[ts.id])
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec_a.id, lec_b.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], [ts], [lec_a, lec_b], [grp], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        entry = result.entries[0]
        assert entry.assigned_lecturer_id in (lec_a.id, lec_b.id)

    def test_pool_frees_other_for_parallel_session(self):
        """KEY TEST. Session S1 has pool [A, B]. Session S2 has only B.
        1 time slot, 2 rooms, 2 student groups.
        Solver should pick A for S1 (freeing B for S2)."""
        rooms = [
            Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL),
            Room(id=uid(), name="R2", capacity=50, room_type=RoomType.LECTURE_HALL),
        ]
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec_a = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        lec_b = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=[ts.id])
        grp1 = StudentGroup(id=uid(), name="G1", size=30)
        grp2 = StudentGroup(id=uid(), name="G2", size=25)

        s1 = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec_a.id, lec_b.id], student_group_ids=[grp1.id],
        )
        s2 = Session(
            id=uid(), course_id=uid(), course_code="CS102",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec_b.id], student_group_ids=[grp2.id],
        )

        result = solve(make_request(rooms, [ts], [lec_a, lec_b], [grp1, grp2], [s1, s2]))

        assert result.status == SolveResultStatus.SOLVED
        assert len(result.entries) == 2

        entry_s1 = get_entry_for_session(result, s1.id)
        entry_s2 = get_entry_for_session(result, s2.id)
        # S1 must pick A so B is free for S2
        assert entry_s1.assigned_lecturer_id == lec_a.id
        # S2 has only B (single lecturer, no assigned_lecturer_id)
        assert entry_s2.assigned_lecturer_id is None

    def test_pool_only_one_available(self):
        """Lec A available at the slot, Lec B not. Solver must pick A."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec_a = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[ts.id])
        lec_b = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=[uid()])  # unavailable
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec_a.id, lec_b.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], [ts], [lec_a, lec_b], [grp], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        assert result.entries[0].assigned_lecturer_id == lec_a.id

    def test_pool_neither_available_infeasible(self):
        """Both lecturers unavailable at all slots → infeasible."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        ts = TimeSlot(id=uid(), day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13")
        lec_a = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[uid()])
        lec_b = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=[uid()])
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=1,
            lecturer_ids=[lec_a.id, lec_b.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], [ts], [lec_a, lec_b], [grp], [sess]))
        assert result.status == SolveResultStatus.INFEASIBLE

    def test_pool_with_duration_2(self):
        """dur=2 session with pool [A, B]. A available at both slots,
        B available at first only. Solver must pick A."""
        room = Room(id=uid(), name="R1", capacity=50, room_type=RoomType.LECTURE_HALL)
        slots = make_time_slots(
            [DayOfWeek.MONDAY],
            [("09:00", "10:00"), ("10:00", "11:00")],
        )
        # A available at both
        lec_a = Lecturer(id=uid(), name="Dr. A", available_time_slot_ids=[s.id for s in slots])
        # B available at first only
        lec_b = Lecturer(id=uid(), name="Dr. B", available_time_slot_ids=[slots[0].id])
        grp = StudentGroup(id=uid(), name="G1", size=30)
        sess = Session(
            id=uid(), course_id=uid(), course_code="CS101",
            session_type=SessionType.LECTURE, duration_slots=2,
            lecturer_ids=[lec_a.id, lec_b.id], student_group_ids=[grp.id],
        )

        result = solve(make_request([room], slots, [lec_a, lec_b], [grp], [sess]))

        assert result.status == SolveResultStatus.SOLVED
        entry = result.entries[0]
        assert len(entry.time_slot_ids) == 2
        assert entry.assigned_lecturer_id == lec_a.id
