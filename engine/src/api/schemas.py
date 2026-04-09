"""Pydantic schemas for the engine API.

IMPORTANT: These must stay in sync with @scheduler/types (packages/types/src/engine.ts).
Any change in the TypeScript types requires a matching change here.
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ---------- Enums ----------

class DayOfWeek(str, Enum):
    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


class RoomType(str, Enum):
    LECTURE_HALL = "lecture_hall"
    LAB = "lab"
    TUTORIAL_ROOM = "tutorial_room"
    SEMINAR_ROOM = "seminar_room"
    COMPUTER_LAB = "computer_lab"


class SessionType(str, Enum):
    LECTURE = "lecture"
    TUTORIAL = "tutorial"
    LAB = "lab"


class ConstraintType(str, Enum):
    # Hard
    ROOM_NO_DOUBLE_BOOKING = "room_no_double_booking"
    LECTURER_NO_DOUBLE_BOOKING = "lecturer_no_double_booking"
    STUDENT_GROUP_NO_DOUBLE_BOOKING = "student_group_no_double_booking"
    ROOM_CAPACITY = "room_capacity"
    ROOM_TYPE_MATCH = "room_type_match"
    LECTURER_AVAILABILITY = "lecturer_availability"
    CONTIGUOUS_MULTI_SLOT = "contiguous_multi_slot"
    # Soft
    MINIMIZE_LECTURER_GAPS = "minimize_lecturer_gaps"
    MINIMIZE_STUDENT_GAPS = "minimize_student_gaps"
    RESPECT_LECTURER_ROOM_PREFERENCE = "respect_lecturer_room_preference"
    RESPECT_LECTURER_TIME_PREFERENCE = "respect_lecturer_time_preference"
    DISTRIBUTE_LOAD_EVENLY = "distribute_load_evenly"
    MINIMIZE_BUILDING_TRAVEL = "minimize_building_travel"


class ConstraintSeverity(str, Enum):
    HARD = "hard"
    SOFT = "soft"


class SolverStatus(str, Enum):
    OPTIMAL = "OPTIMAL"
    FEASIBLE = "FEASIBLE"
    INFEASIBLE = "INFEASIBLE"
    UNKNOWN = "UNKNOWN"
    MODEL_INVALID = "MODEL_INVALID"


class SolveResultStatus(str, Enum):
    SOLVED = "solved"
    INFEASIBLE = "infeasible"
    FAILED = "failed"
    TIMEOUT = "timeout"


# ---------- Input models (Next.js -> Engine) ----------

class Room(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=255)
    capacity: int = Field(ge=1, le=10000)
    room_type: RoomType = Field(alias="roomType")
    building: Optional[str] = Field(default=None, max_length=255)
    equipment: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class TimeSlot(BaseModel):
    id: str
    day_of_week: DayOfWeek = Field(alias="dayOfWeek")
    start_time: str = Field(alias="startTime", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end_time: str = Field(alias="endTime", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")  # YYYY-MM-DD

    model_config = {"populate_by_name": True}


class Lecturer(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=255)
    available_time_slot_ids: list[str] = Field(alias="availableTimeSlotIds")
    preferred_room_ids: list[str] = Field(default_factory=list, alias="preferredRoomIds")
    preferred_time_slot_ids: list[str] = Field(default_factory=list, alias="preferredTimeSlotIds")
    max_consecutive_slots: int = Field(default=4, ge=1, le=12, alias="maxConsecutiveSlots")

    model_config = {"populate_by_name": True}


class StudentGroup(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=255)
    size: int = Field(ge=1, le=10000)


class Session(BaseModel):
    id: str
    course_id: str = Field(alias="courseId")
    course_code: str = Field(alias="courseCode", min_length=1, max_length=50)
    session_type: SessionType = Field(alias="sessionType")
    duration_slots: int = Field(alias="durationSlots", ge=1, le=12)
    lecturer_ids: list[str] = Field(alias="lecturerIds", min_length=1)
    student_group_ids: list[str] = Field(alias="studentGroupIds", min_length=1)
    required_room_type: Optional[RoomType] = Field(default=None, alias="requiredRoomType")
    required_equipment: list[str] = Field(default_factory=list, alias="requiredEquipment")
    allowed_time_slot_ids: list[str] | None = Field(default=None, alias="allowedTimeSlotIds")

    model_config = {"populate_by_name": True}


class Constraint(BaseModel):
    type: ConstraintType
    severity: ConstraintSeverity
    weight: float = Field(default=1.0, ge=0, le=1000)
    config: dict[str, object] = Field(default_factory=dict)


class SolverConfig(BaseModel):
    timeout_seconds: int = Field(default=60, ge=5, le=3600, alias="timeoutSeconds")
    num_workers: int = Field(default=4, ge=1, le=16, alias="numWorkers")
    random_seed: Optional[int] = Field(default=None, alias="randomSeed")

    model_config = {"populate_by_name": True}


class SolveRequest(BaseModel):
    tenant_id: str = Field(alias="tenantId")
    schedule_id: str = Field(alias="scheduleId")
    callback_url: str = Field(alias="callbackUrl")
    rooms: list[Room] = Field(min_length=1)
    time_slots: list[TimeSlot] = Field(min_length=1, alias="timeSlots")
    lecturers: list[Lecturer] = Field(min_length=1)
    student_groups: list[StudentGroup] = Field(min_length=1, alias="studentGroups")
    sessions: list[Session] = Field(min_length=1)
    constraints: list[Constraint] = Field(default_factory=list)
    solver_config: SolverConfig = Field(default_factory=SolverConfig, alias="solverConfig")

    model_config = {"populate_by_name": True}


# ---------- Response models ----------

class SolveAcceptedResponse(BaseModel):
    job_id: str = Field(alias="jobId")
    status: str = "accepted"
    estimated_time_seconds: int = Field(alias="estimatedTimeSeconds")

    model_config = {"populate_by_name": True, "by_alias": True}


# ---------- Result models (Engine -> Next.js callback) ----------

class ScheduleEntry(BaseModel):
    session_id: str = Field(alias="sessionId")
    room_id: str = Field(alias="roomId")
    time_slot_ids: list[str] = Field(alias="timeSlotIds", min_length=1)
    assigned_lecturer_id: str | None = Field(default=None, alias="assignedLecturerId")

    model_config = {"populate_by_name": True, "by_alias": True}


class Conflict(BaseModel):
    constraint_type: ConstraintType = Field(alias="constraintType")
    message: str
    involved_session_ids: list[str] = Field(default_factory=list, alias="involvedSessionIds")
    involved_room_ids: list[str] = Field(default_factory=list, alias="involvedRoomIds")
    involved_lecturer_ids: list[str] = Field(default_factory=list, alias="involvedLecturerIds")

    model_config = {"populate_by_name": True, "by_alias": True}


class SolverStats(BaseModel):
    status: SolverStatus
    wall_time_seconds: float = Field(alias="wallTimeSeconds")
    objective_value: Optional[float] = Field(default=None, alias="objectiveValue")
    num_branches: int = Field(default=0, alias="numBranches")
    num_conflicts: int = Field(default=0, alias="numConflicts")
    soft_constraint_scores: dict[str, float] = Field(
        default_factory=dict, alias="softConstraintScores"
    )

    model_config = {"populate_by_name": True, "by_alias": True}


class SolveResult(BaseModel):
    job_id: str = Field(alias="jobId")
    tenant_id: str = Field(alias="tenantId")
    schedule_id: str = Field(alias="scheduleId")
    status: SolveResultStatus
    entries: list[ScheduleEntry] = Field(default_factory=list)
    conflicts: list[Conflict] = Field(default_factory=list)
    stats: SolverStats
    error_message: Optional[str] = Field(default=None, alias="errorMessage")

    model_config = {"populate_by_name": True, "by_alias": True}


# ---------- Health ----------

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    or_tools_version: str
