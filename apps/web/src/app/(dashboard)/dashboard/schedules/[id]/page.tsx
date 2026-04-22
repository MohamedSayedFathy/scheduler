'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Clock, Download, Hash, Loader2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScheduleStatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/trpc/client';
import { detectConflicts, type Conflict } from '@/lib/schedules/conflicts';

import { ConflictWarningDialog } from '@/components/schedules/conflict-warning-dialog';
import { EntryDetailDialog } from '@/components/schedules/entry-detail-dialog';
import { MoveScopeDialog } from '@/components/schedules/move-scope-dialog';
import type { ScheduleEntryData } from '@/components/schedules/schedule-entry-card';
import { TimetableFilters } from '@/components/schedules/timetable-filters';
import { TimetableGrid } from '@/components/schedules/timetable-grid';
import { VersionSelector } from '@/components/schedules/version-selector';
import {
  buildWeekList,
  isoWeekKey,
  WeekNavigator,
} from '@/components/schedules/week-navigator';
import { exportSchedulePdf } from '@/lib/export-pdf';

function parseSolverStats(
  raw: string | null,
): { wallTime?: number; objectiveScore?: number } | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { wallTime?: number; objectiveScore?: number };
  } catch {
    return null;
  }
}

function formatSolverTime(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  return `${seconds.toFixed(1)}s`;
}

interface PendingDrop {
  entry: ScheduleEntryData;
  targetDayOfWeek: string;
  targetStartTime: string;
  newConflicts: Conflict[];
}

export default function ScheduleDetailPage() {
  const params = useParams<{ id: string }>();
  const scheduleId = params.id;
  const { toast } = useToast();

  const { data: schedule, isLoading: scheduleLoading } = api.schedules.getById.useQuery(
    { id: scheduleId },
    {
      refetchInterval: (query) => {
        const s = query.state.data;
        if (!s) return false;
        return s.status === 'pending' || s.status === 'solving' ? 5000 : false;
      },
    },
  );

  const { data: courses } = api.courses.list.useQuery();
  const { data: allRooms } = api.rooms.list.useQuery();
  const { data: allTimeSlots } = api.timeSlots.list.useQuery();
  const { data: studentGroups } = api.studentGroups.list.useQuery();

  const utils = api.useUtils();

  const moveEntry = api.schedules.moveEntry.useMutation({
    onSuccess: () => {
      utils.schedules.getById.invalidate({ id: scheduleId });
      toast({ title: 'Entry moved', description: 'Schedule entry updated successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Failed to move entry', description: error.message, variant: 'destructive' });
    },
  });

  // Filters
  const [selectedLecturer, setSelectedLecturer] = useState<string | null>(null);
  const [selectedStudentGroup, setSelectedStudentGroup] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

  // Week navigation
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);

  // Entry detail dialog
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntryData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // DnD drop flow state
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);

  // Build lookup maps
  const courseMap = useMemo(() => {
    if (!courses) return new Map<string, { code: string; name: string; id: string }>();
    const map = new Map<string, { code: string; name: string; id: string }>();
    for (const course of courses) {
      for (const session of course.sessions) {
        map.set(session.id, { code: course.code, name: course.name, id: course.id });
      }
    }
    return map;
  }, [courses]);

  // Build lecturer lookup: sessionId → lecturer records
  const lecturersBySessionMap = useMemo(() => {
    const map = new Map<string, { lecturerId: string; firstName: string | null; lastName: string | null }[]>();
    if (!schedule?.lecturersBySession) return map;
    for (const l of schedule.lecturersBySession) {
      const existing = map.get(l.sessionId) ?? [];
      existing.push({ lecturerId: l.lecturerId, firstName: l.firstName, lastName: l.lastName });
      map.set(l.sessionId, existing);
    }
    return map;
  }, [schedule?.lecturersBySession]);

  // Build student group lookup: courseId → studentGroupIds
  const studentGroupsByCourseMap = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!schedule?.studentGroupsByCourse) return map;
    for (const sg of schedule.studentGroupsByCourse) {
      const existing = map.get(sg.courseId) ?? [];
      existing.push(sg.studentGroupId);
      map.set(sg.courseId, existing);
    }
    return map;
  }, [schedule?.studentGroupsByCourse]);

  // Transform schedule entries to ScheduleEntryData
  const entryData: ScheduleEntryData[] = useMemo(() => {
    if (!schedule?.entries) return [];

    return schedule.entries.map((e) => {
      const courseInfo = courseMap.get(e.session.id);
      const lecturers = lecturersBySessionMap.get(e.session.id) ?? [];
      const lecturerName =
        lecturers.length > 0
          ? lecturers
              .map((l) => [l.firstName, l.lastName].filter(Boolean).join(' ') || 'Unknown')
              .join(', ')
          : undefined;
      const studentGroupIds = studentGroupsByCourseMap.get(e.session.courseId) ?? [];
      return {
        entryId: e.entry.id,
        sessionId: e.session.id,
        courseCode: courseInfo?.code ?? 'Unknown',
        courseName: courseInfo?.name ?? 'Unknown Course',
        courseId: courseInfo?.id ?? e.session.courseId,
        sessionType: e.session.sessionType as 'lecture' | 'tutorial' | 'lab',
        roomName: e.room.name,
        roomId: e.room.id,
        timeSlotId: e.timeSlot.id,
        date: e.timeSlot.date,
        dayOfWeek: e.timeSlot.dayOfWeek,
        startTime: e.timeSlot.startTime,
        endTime: e.timeSlot.endTime,
        durationSlots: e.session.durationSlots,
        lecturerName,
        lecturerIds: lecturers.map((l) => l.lecturerId),
        studentGroupIds,
        groupColor: e.groupColor ?? undefined,
      };
    });
  }, [schedule?.entries, courseMap, lecturersBySessionMap, studentGroupsByCourseMap]);

  // Conflict detection on current entries
  const conflictInputSessions = useMemo(() => {
    if (!schedule?.entries) return [];
    const sessionTypeToRoomType: Record<string, string> = {
      lecture: 'lecture_hall',
      tutorial: 'tutorial_room',
      lab: 'lab',
    };
    const sessionIds = [...new Set(schedule.entries.map((e) => e.session.id))];
    return sessionIds.map((sid) => {
      const e = schedule.entries.find((en) => en.session.id === sid);
      if (!e) return null;
      const lecturers = lecturersBySessionMap.get(sid)?.map((l) => l.lecturerId) ?? [];
      const studentGroupIds = studentGroupsByCourseMap.get(e.session.courseId) ?? [];
      return {
        id: sid,
        sessionType: e.session.sessionType,
        requiredRoomType: sessionTypeToRoomType[e.session.sessionType],
        durationSlots: e.session.durationSlots,
        lecturerIds: lecturers,
        studentGroupIds,
      };
    }).filter((s): s is NonNullable<typeof s> => s !== null);
  }, [schedule?.entries, lecturersBySessionMap, studentGroupsByCourseMap]);

  const conflicts = useMemo(() => {
    if (!schedule?.entries || entryData.length === 0) return [] as Conflict[];
    const roomList = allRooms?.map((r) => ({ id: r.id, capacity: r.capacity, roomType: r.roomType })) ?? [];
    const tsList = allTimeSlots?.map((ts) => ({
      id: ts.id,
      dayOfWeek: ts.dayOfWeek,
      startTime: ts.startTime,
      endTime: ts.endTime,
      date: ts.date,
    })) ?? [];
    const sgList = studentGroups?.map((sg) => ({ id: sg.id, size: sg.size })) ?? [];

    return detectConflicts({
      entries: entryData.map((e) => ({ id: e.entryId, sessionId: e.sessionId, roomId: e.roomId, timeSlotId: e.timeSlotId })),
      sessions: conflictInputSessions,
      rooms: roomList,
      timeSlots: tsList,
      studentGroups: sgList,
      lecturerAvailability: new Map(),
    });
  }, [entryData, conflictInputSessions, allRooms, allTimeSlots, studentGroups, schedule?.entries]);

  const conflictedEntryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of conflicts) {
      for (const id of c.entryIds) ids.add(id);
    }
    return ids;
  }, [conflicts]);

  const conflictsByEntryId = useMemo(() => {
    const map = new Map<string, Conflict[]>();
    for (const c of conflicts) {
      for (const id of c.entryIds) {
        const existing = map.get(id) ?? [];
        existing.push(c);
        map.set(id, existing);
      }
    }
    return map;
  }, [conflicts]);

  // Compute available weeks from entry dates and initialise the selected week
  const availableWeeks = useMemo(() => buildWeekList(entryData.map((e) => e.date)), [entryData]);

  useEffect(() => {
    if (availableWeeks.length === 0) return;
    if (selectedWeekKey !== null) return;

    const todayKey = isoWeekKey(new Date().toISOString().slice(0, 10));
    const todayExists = availableWeeks.some(
      (w) => `${w.year}-W${String(w.isoWeek).padStart(2, '0')}` === todayKey,
    );

    if (todayExists) {
      setSelectedWeekKey(todayKey);
    } else {
      const first = availableWeeks[0];
      if (first) {
        setSelectedWeekKey(`${first.year}-W${String(first.isoWeek).padStart(2, '0')}`);
      }
    }
  }, [availableWeeks, selectedWeekKey]);

  // Filter entries to the selected week
  const weekFilteredEntries = useMemo(() => {
    if (!selectedWeekKey || availableWeeks.length === 0) return entryData;
    return entryData.filter((e) => isoWeekKey(e.date) === selectedWeekKey);
  }, [entryData, selectedWeekKey, availableWeeks]);

  // Build unique lecturer options
  const lecturerOptions = useMemo(() => {
    if (!schedule?.lecturersBySession) return [] as { id: string; label: string }[];
    const seen = new Set<string>();
    const options: { id: string; label: string }[] = [];
    for (const l of schedule.lecturersBySession) {
      if (!seen.has(l.lecturerId)) {
        seen.add(l.lecturerId);
        const label = [l.firstName, l.lastName].filter(Boolean).join(' ') || l.lecturerId;
        options.push({ id: l.lecturerId, label });
      }
    }
    return options;
  }, [schedule?.lecturersBySession]);

  const studentGroupOptions = useMemo(() => {
    if (!studentGroups) return [];
    return studentGroups.map((g) => ({ id: g.id, label: g.name }));
  }, [studentGroups]);

  const roomOptions = useMemo(() => {
    if (!allRooms) return [];
    return allRooms.map((r) => ({ id: r.id, label: r.name }));
  }, [allRooms]);

  const courseOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { id: string; label: string }[] = [];
    for (const e of entryData) {
      if (e.courseId && !seen.has(e.courseId)) {
        seen.add(e.courseId);
        options.push({ id: e.courseId, label: `${e.courseCode} — ${e.courseName}` });
      }
    }
    return options;
  }, [entryData]);

  const filterFn = useCallback(
    (entry: ScheduleEntryData): boolean => {
      if (selectedRoom && entry.roomId !== selectedRoom) return false;
      if (selectedLecturer && !entry.lecturerIds?.includes(selectedLecturer)) return false;
      if (selectedStudentGroup && !entry.studentGroupIds?.includes(selectedStudentGroup)) return false;
      if (selectedCourse && entry.courseId !== selectedCourse) return false;
      return true;
    },
    [selectedRoom, selectedLecturer, selectedStudentGroup, selectedCourse],
  );

  const hasActiveFilters = selectedLecturer || selectedStudentGroup || selectedRoom || selectedCourse;

  function handleEntryClick(entry: ScheduleEntryData) {
    setSelectedEntry(entry);
    setDialogOpen(true);
  }

  function handleEntryDrop(
    entry: ScheduleEntryData,
    targetDayOfWeek: string,
    targetStartTime: string,
  ) {
    // If nothing changed, skip
    if (entry.dayOfWeek === targetDayOfWeek && entry.startTime.slice(0, 5) === targetStartTime) return;

    // Find the target time slot in the current week entries
    const targetSlot = weekFilteredEntries.find(
      (e) => e.dayOfWeek === targetDayOfWeek && e.startTime.slice(0, 5) === targetStartTime,
    );

    // Compute what the hypothetical new entry set would look like
    // (replace all entries for this session with the new time slot)
    const sessionId = getSessionIdForEntry(entry);

    const targetTimeSlotId = targetSlot?.timeSlotId;
    if (!targetTimeSlotId) return; // Cell not covered by any slot — cancel drop

    // Build hypothetical new entries for the current week
    const hypotheticalEntries = weekFilteredEntries.map((e) => {
      if (getSessionIdForEntry(e) === sessionId) {
        return { ...e, timeSlotId: targetTimeSlotId, dayOfWeek: targetDayOfWeek, startTime: targetStartTime };
      }
      return e;
    });

    // Detect conflicts in new state
    const roomList = allRooms?.map((r) => ({ id: r.id, capacity: r.capacity, roomType: r.roomType })) ?? [];
    const tsList = allTimeSlots?.map((ts) => ({
      id: ts.id, dayOfWeek: ts.dayOfWeek, startTime: ts.startTime, endTime: ts.endTime, date: ts.date,
    })) ?? [];
    const sgList = studentGroups?.map((sg) => ({ id: sg.id, size: sg.size })) ?? [];

    const newConflicts = detectConflicts({
      entries: hypotheticalEntries.map((e) => ({
        id: e.entryId,
        sessionId: getSessionIdForEntry(e),
        roomId: e.roomId,
        timeSlotId: e.timeSlotId,
      })),
      sessions: conflictInputSessions,
      rooms: roomList,
      timeSlots: tsList,
      studentGroups: sgList,
      lecturerAvailability: new Map(),
    });

    // Find newly introduced conflicts (not already present)
    const existingConflictMessages = new Set(conflicts.map((c) => c.message));
    const newlyIntroduced = newConflicts.filter((c) => !existingConflictMessages.has(c.message));

    setPendingDrop({ entry, targetDayOfWeek, targetStartTime, newConflicts: newlyIntroduced });

    if (newlyIntroduced.length > 0) {
      setConflictDialogOpen(true);
    } else {
      setScopeDialogOpen(true);
    }
  }

  function getSessionIdForEntry(entry: ScheduleEntryData): string {
    return entry.sessionId;
  }

  function executeMoveEntry(applyToAllWeeks: boolean) {
    if (!pendingDrop) return;
    const sessionId = getSessionIdForEntry(pendingDrop.entry);

    // Find the matching time slot id for the target
    const targetSlot = weekFilteredEntries.find(
      (e) =>
        e.dayOfWeek === pendingDrop.targetDayOfWeek &&
        e.startTime.slice(0, 5) === pendingDrop.targetStartTime,
    );
    if (!targetSlot) return;

    moveEntry.mutate({
      scheduleId,
      sessionId,
      currentTimeSlotId: pendingDrop.entry.timeSlotId,
      newStartTimeSlotId: targetSlot.timeSlotId,
      applyToAllWeeks,
    });

    setPendingDrop(null);
  }

  function handleConflictConfirm() {
    setScopeDialogOpen(true);
  }

  function handleConflictCancel() {
    setPendingDrop(null);
  }

  function handleScopeSelect(scope: 'this_week' | 'all_weeks') {
    executeMoveEntry(scope === 'all_weeks');
  }

  const handleDownloadPdf = useCallback(() => {
    const filtered = hasActiveFilters ? entryData.filter(filterFn!) : entryData;

    const filterLabels: string[] = [];
    if (selectedLecturer) {
      const lec = lecturerOptions.find((l) => l.id === selectedLecturer);
      if (lec) filterLabels.push(`Lecturer: ${lec.label}`);
    }
    if (selectedStudentGroup) {
      const sg = studentGroupOptions.find((g) => g.id === selectedStudentGroup);
      if (sg) filterLabels.push(`Student Group: ${sg.label}`);
    }
    if (selectedRoom) {
      const rm = roomOptions.find((r) => r.id === selectedRoom);
      if (rm) filterLabels.push(`Room: ${rm.label}`);
    }
    if (selectedCourse) {
      const co = courseOptions.find((c) => c.id === selectedCourse);
      if (co) filterLabels.push(`Course: ${co.label}`);
    }

    exportSchedulePdf({
      entries: filtered,
      scheduleName: schedule?.name ?? 'Schedule',
      filterLabels,
    });
  }, [entryData, hasActiveFilters, filterFn, selectedLecturer, selectedStudentGroup, selectedRoom, selectedCourse, lecturerOptions, studentGroupOptions, roomOptions, courseOptions, schedule?.name]);

  if (scheduleLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-6 w-6" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/schedules"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Schedules
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center py-12">
            <XCircle className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Schedule not found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This schedule may have been deleted.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = parseSolverStats(schedule.solverStats);

  if (schedule.status === 'pending' || schedule.status === 'solving') {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/schedules"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Schedules
        </Link>

        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {schedule.name ?? 'Untitled Schedule'}
          </h1>
          <div className="flex items-center gap-3">
            <ScheduleStatusBadge status={schedule.status} />
          </div>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <Loader2 className="h-12 w-12 animate-spin text-yellow-600" />
            <h3 className="mt-4 text-lg font-semibold">Generating schedule...</h3>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-md">
              The scheduling engine is working on finding the optimal timetable. This may take a few
              moments depending on the number of courses and constraints.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (schedule.status === 'infeasible') {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/schedules"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Schedules
        </Link>

        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {schedule.name ?? 'Untitled Schedule'}
          </h1>
          <div className="flex items-center gap-3">
            <ScheduleStatusBadge status={schedule.status} />
          </div>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <AlertTriangle className="h-12 w-12 text-orange-500" />
            <h3 className="mt-4 text-lg font-semibold">Infeasible Schedule</h3>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-md">
              The scheduler could not find a valid timetable with the current configuration. Try
              adding more rooms, time slots, or relaxing constraints.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (schedule.status === 'failed') {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/schedules"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Schedules
        </Link>

        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            {schedule.name ?? 'Untitled Schedule'}
          </h1>
          <div className="flex items-center gap-3">
            <ScheduleStatusBadge status={schedule.status} />
          </div>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <XCircle className="h-12 w-12 text-destructive" />
            <h3 className="mt-4 text-lg font-semibold">Schedule Generation Failed</h3>
            <p className="mt-2 text-sm text-muted-foreground text-center max-w-md">
              {schedule.errorMessage ?? 'An unexpected error occurred during schedule generation.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/schedules"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Schedules
      </Link>

      {/* Schedule info bar */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="text-3xl font-bold tracking-tight flex-1">
            {schedule.name ?? 'Untitled Schedule'}
          </h1>
          <VersionSelector scheduleId={scheduleId} />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <ScheduleStatusBadge status={schedule.status} />
          {stats?.wallTime != null && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{formatSolverTime(stats.wallTime)}</span>
            </div>
          )}
          {stats?.objectiveScore != null && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span>Score: {stats.objectiveScore}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Hash className="h-4 w-4" />
            <span>{entryData.length} entries</span>
          </div>
          {conflictedEntryIds.size > 0 && (
            <div className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>{conflictedEntryIds.size} conflicted</span>
            </div>
          )}
          <Button variant="outline" size="sm" className="ml-auto" onClick={handleDownloadPdf}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </div>

      <Separator />

      {/* Filters */}
      <TimetableFilters
        lecturers={lecturerOptions}
        studentGroups={studentGroupOptions}
        rooms={roomOptions}
        courses={courseOptions}
        selectedLecturer={selectedLecturer}
        selectedStudentGroup={selectedStudentGroup}
        selectedRoom={selectedRoom}
        selectedCourse={selectedCourse}
        onLecturerChange={setSelectedLecturer}
        onStudentGroupChange={setSelectedStudentGroup}
        onRoomChange={setSelectedRoom}
        onCourseChange={setSelectedCourse}
      />

      {/* Week Navigator */}
      {availableWeeks.length > 0 && selectedWeekKey && (
        <WeekNavigator
          weeks={availableWeeks}
          selectedWeekKey={selectedWeekKey}
          onWeekChange={setSelectedWeekKey}
        />
      )}

      {/* Timetable Grid */}
      <TimetableGrid
        entries={weekFilteredEntries}
        onEntryClick={handleEntryClick}
        filterFn={hasActiveFilters ? filterFn : undefined}
        conflictedEntryIds={conflictedEntryIds}
        conflictsByEntryId={conflictsByEntryId}
        onEntryDrop={handleEntryDrop}
      />

      {/* Entry Detail Dialog */}
      <EntryDetailDialog
        entry={selectedEntry}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rooms={allRooms ?? []}
        timeSlots={
          allTimeSlots?.map((ts) => ({
            id: ts.id,
            dayOfWeek: ts.dayOfWeek,
            startTime: ts.startTime,
            endTime: ts.endTime,
          })) ?? []
        }
        scheduleId={scheduleId}
      />

      {/* Conflict warning dialog */}
      <ConflictWarningDialog
        open={conflictDialogOpen}
        onOpenChange={setConflictDialogOpen}
        conflicts={pendingDrop?.newConflicts ?? []}
        onConfirm={handleConflictConfirm}
        onCancel={handleConflictCancel}
      />

      {/* Move scope dialog */}
      <MoveScopeDialog
        open={scopeDialogOpen}
        onOpenChange={setScopeDialogOpen}
        onSelect={handleScopeSelect}
      />
    </div>
  );
}
