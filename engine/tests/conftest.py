"""Shared test fixtures for the scheduling engine."""

import uuid

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
    SolverConfig,
    StudentGroup,
    TimeSlot,
)


def uid() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def simple_problem() -> SolveRequest:
    """A minimal valid problem: 1 session, 1 room, 1 time slot, 1 lecturer, 1 group.

    This should always be solvable.
    """
    room_id = uid()
    ts_id = uid()
    lecturer_id = uid()
    group_id = uid()
    session_id = uid()
    course_id = uid()

    return SolveRequest(
        tenant_id=uid(),
        schedule_id=uid(),
        callback_url="http://localhost:3000/api/webhooks/engine",
        rooms=[Room(id=room_id, name="Room A", capacity=50, room_type=RoomType.LECTURE_HALL)],
        time_slots=[
            TimeSlot(
                id=ts_id,
                day_of_week=DayOfWeek.MONDAY,
                start_time="09:00",
                end_time="10:00",
                date="2026-04-13",
            )
        ],
        lecturers=[
            Lecturer(
                id=lecturer_id,
                name="Dr. Smith",
                available_time_slot_ids=[ts_id],
            )
        ],
        student_groups=[StudentGroup(id=group_id, name="CS Year 1", size=30)],
        sessions=[
            Session(
                id=session_id,
                course_id=course_id,
                course_code="CS101",
                session_type=SessionType.LECTURE,
                duration_slots=1,
                lecturer_ids=[lecturer_id],
                student_group_ids=[group_id],
            )
        ],
        solver_config=SolverConfig(timeout_seconds=10, num_workers=1),
    )


@pytest.fixture
def conflict_problem() -> SolveRequest:
    """A problem with 2 sessions needing the same room, same time, same lecturer.

    This tests that the solver correctly detects conflicts.
    """
    room_id = uid()
    ts_id = uid()
    lecturer_id = uid()
    group1_id = uid()
    group2_id = uid()
    course_id = uid()

    return SolveRequest(
        tenant_id=uid(),
        schedule_id=uid(),
        callback_url="http://localhost:3000/api/webhooks/engine",
        rooms=[Room(id=room_id, name="Room A", capacity=50, room_type=RoomType.LECTURE_HALL)],
        time_slots=[
            TimeSlot(
                id=ts_id,
                day_of_week=DayOfWeek.MONDAY,
                start_time="09:00",
                end_time="10:00",
                date="2026-04-13",
            )
        ],
        lecturers=[
            Lecturer(
                id=lecturer_id,
                name="Dr. Smith",
                available_time_slot_ids=[ts_id],
            )
        ],
        student_groups=[
            StudentGroup(id=group1_id, name="CS Year 1", size=30),
            StudentGroup(id=group2_id, name="CS Year 2", size=30),
        ],
        sessions=[
            Session(
                id=uid(),
                course_id=course_id,
                course_code="CS101",
                session_type=SessionType.LECTURE,
                duration_slots=1,
                lecturer_ids=[lecturer_id],
                student_group_ids=[group1_id],
            ),
            Session(
                id=uid(),
                course_id=course_id,
                course_code="CS102",
                session_type=SessionType.LECTURE,
                duration_slots=1,
                lecturer_ids=[lecturer_id],
                student_group_ids=[group2_id],
            ),
        ],
        solver_config=SolverConfig(timeout_seconds=10, num_workers=1),
    )


@pytest.fixture
def multi_slot_problem() -> SolveRequest:
    """Problem with 3 sessions, 2 rooms, 5 time slots. Should be solvable."""
    room1, room2 = uid(), uid()
    ts_ids = [uid() for _ in range(5)]
    lec1, lec2 = uid(), uid()
    grp1, grp2 = uid(), uid()

    return SolveRequest(
        tenant_id=uid(),
        schedule_id=uid(),
        callback_url="http://localhost:3000/api/webhooks/engine",
        rooms=[
            Room(id=room1, name="Hall A", capacity=100, room_type=RoomType.LECTURE_HALL),
            Room(id=room2, name="Lab B", capacity=40, room_type=RoomType.LAB),
        ],
        time_slots=[
            TimeSlot(id=ts_ids[0], day_of_week=DayOfWeek.MONDAY, start_time="09:00", end_time="10:00", date="2026-04-13"),
            TimeSlot(id=ts_ids[1], day_of_week=DayOfWeek.MONDAY, start_time="10:00", end_time="11:00", date="2026-04-13"),
            TimeSlot(id=ts_ids[2], day_of_week=DayOfWeek.MONDAY, start_time="11:00", end_time="12:00", date="2026-04-13"),
            TimeSlot(id=ts_ids[3], day_of_week=DayOfWeek.TUESDAY, start_time="09:00", end_time="10:00", date="2026-04-14"),
            TimeSlot(id=ts_ids[4], day_of_week=DayOfWeek.TUESDAY, start_time="10:00", end_time="11:00", date="2026-04-14"),
        ],
        lecturers=[
            Lecturer(id=lec1, name="Dr. A", available_time_slot_ids=ts_ids),
            Lecturer(id=lec2, name="Dr. B", available_time_slot_ids=ts_ids),
        ],
        student_groups=[
            StudentGroup(id=grp1, name="Group 1", size=30),
            StudentGroup(id=grp2, name="Group 2", size=25),
        ],
        sessions=[
            Session(
                id=uid(), course_id=uid(), course_code="CS101",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lec1], student_group_ids=[grp1],
            ),
            Session(
                id=uid(), course_id=uid(), course_code="CS102",
                session_type=SessionType.LAB, duration_slots=1,
                lecturer_ids=[lec2], student_group_ids=[grp2],
                required_room_type=RoomType.LAB,
            ),
            Session(
                id=uid(), course_id=uid(), course_code="CS103",
                session_type=SessionType.LECTURE, duration_slots=1,
                lecturer_ids=[lec1], student_group_ids=[grp1, grp2],
            ),
        ],
        solver_config=SolverConfig(timeout_seconds=10, num_workers=1),
    )
