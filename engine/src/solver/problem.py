"""Problem data structures for the solver.

Transforms the API request into indexed solver-friendly data.
"""

from collections import defaultdict
from dataclasses import dataclass, field

from src.api.schemas import (
    Lecturer,
    Room,
    RoomType,
    Session,
    SolveRequest,
    StudentGroup,
    TimeSlot,
)


@dataclass
class ProblemData:
    """Indexed problem data ready for the solver.

    All entities are stored in lists with stable integer indices.
    Lookup dicts map UUIDs back to indices for cross-referencing.
    """

    rooms: list[Room]
    time_slots: list[TimeSlot]
    sessions: list[Session]
    lecturers: list[Lecturer]
    student_groups: list[StudentGroup]

    room_idx: dict[str, int] = field(default_factory=dict)
    time_slot_idx: dict[str, int] = field(default_factory=dict)
    session_idx: dict[str, int] = field(default_factory=dict)
    lecturer_idx: dict[str, int] = field(default_factory=dict)
    student_group_idx: dict[str, int] = field(default_factory=dict)

    # Pre-computed lookups
    lecturer_available_slots: dict[int, set[int]] = field(default_factory=dict)
    session_lecturers: dict[int, list[int]] = field(default_factory=dict)
    session_student_groups: dict[int, list[int]] = field(default_factory=dict)
    student_group_sessions: dict[int, list[int]] = field(default_factory=dict)
    lecturer_sessions: dict[int, list[int]] = field(default_factory=dict)

    # Multi-slot infrastructure
    next_slot: dict[int, int] = field(default_factory=dict)
    session_duration: dict[int, int] = field(default_factory=dict)

    def get_occupied_slots(self, s_idx: int, start_t_idx: int) -> list[int] | None:
        """Return chain of duration_slots consecutive slot indices starting at start_t_idx.

        Returns None if the chain breaks (not enough consecutive slots).
        """
        duration = self.session_duration.get(s_idx, 1)
        if duration == 1:
            return [start_t_idx]

        chain = [start_t_idx]
        current = start_t_idx
        for _ in range(duration - 1):
            nxt = self.next_slot.get(current)
            if nxt is None:
                return None
            chain.append(nxt)
            current = nxt
        return chain

    @staticmethod
    def from_request(request: SolveRequest) -> "ProblemData":
        """Build indexed problem data from a solve request."""
        problem = ProblemData(
            rooms=list(request.rooms),
            time_slots=list(request.time_slots),
            sessions=list(request.sessions),
            lecturers=list(request.lecturers),
            student_groups=list(request.student_groups),
        )

        # Build index maps
        problem.room_idx = {r.id: i for i, r in enumerate(problem.rooms)}
        problem.time_slot_idx = {ts.id: i for i, ts in enumerate(problem.time_slots)}
        problem.session_idx = {s.id: i for i, s in enumerate(problem.sessions)}
        problem.lecturer_idx = {l.id: i for i, l in enumerate(problem.lecturers)}
        problem.student_group_idx = {sg.id: i for i, sg in enumerate(problem.student_groups)}

        # Build next_slot: group time slots by date, sort by start_time,
        # link adjacent pairs where A.end_time == B.start_time
        date_groups: dict[str, list[int]] = defaultdict(list)
        for i, ts in enumerate(problem.time_slots):
            date_groups[ts.date].append(i)

        for date, indices in date_groups.items():
            sorted_indices = sorted(indices, key=lambda i: problem.time_slots[i].start_time)
            for a, b in zip(sorted_indices, sorted_indices[1:]):
                if problem.time_slots[a].end_time == problem.time_slots[b].start_time:
                    problem.next_slot[a] = b

        # Build session_duration
        problem.session_duration = {
            i: s.duration_slots for i, s in enumerate(problem.sessions)
        }

        # Lecturer availability: lecturer_idx -> set of time_slot_idx
        for l_i, lecturer in enumerate(problem.lecturers):
            problem.lecturer_available_slots[l_i] = {
                problem.time_slot_idx[ts_id]
                for ts_id in lecturer.available_time_slot_ids
                if ts_id in problem.time_slot_idx
            }

        # Session -> lecturer mappings
        for s_i, session in enumerate(problem.sessions):
            problem.session_lecturers[s_i] = [
                problem.lecturer_idx[lid]
                for lid in session.lecturer_ids
                if lid in problem.lecturer_idx
            ]
            problem.session_student_groups[s_i] = [
                problem.student_group_idx[sgid]
                for sgid in session.student_group_ids
                if sgid in problem.student_group_idx
            ]

        # Reverse mappings
        for s_i, session in enumerate(problem.sessions):
            for sg_i in problem.session_student_groups.get(s_i, []):
                problem.student_group_sessions.setdefault(sg_i, []).append(s_i)
            for l_i in problem.session_lecturers.get(s_i, []):
                problem.lecturer_sessions.setdefault(l_i, []).append(s_i)

        return problem

    def is_feasible_assignment(self, session_idx: int, room_idx: int) -> bool:
        """Pre-filter: can this session possibly be assigned to this room?

        Checks room type compatibility and capacity. This dramatically
        reduces the number of variables the solver needs to consider.
        """
        session = self.sessions[session_idx]
        room = self.rooms[room_idx]

        # Room type must match if required
        if session.required_room_type is not None and room.room_type != session.required_room_type:
            return False

        # Room capacity must accommodate the largest student group
        total_students = sum(
            self.student_groups[sg_i].size
            for sg_i in self.session_student_groups.get(session_idx, [])
        )
        if room.capacity < total_students:
            return False

        # Required equipment must be available
        if session.required_equipment:
            room_equip = set(room.equipment)
            if not all(eq in room_equip for eq in session.required_equipment):
                return False

        return True
