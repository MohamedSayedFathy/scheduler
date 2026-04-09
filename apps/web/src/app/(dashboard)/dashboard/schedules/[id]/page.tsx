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
import { api } from '@/lib/trpc/client';

import { EntryDetailDialog } from '@/components/schedules/entry-detail-dialog';
import type { ScheduleEntryData } from '@/components/schedules/schedule-entry-card';
import { TimetableFilters } from '@/components/schedules/timetable-filters';
import { TimetableGrid } from '@/components/schedules/timetable-grid';
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

export default function ScheduleDetailPage() {
  const params = useParams<{ id: string }>();
  const scheduleId = params.id;

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
      };
    });
  }, [schedule?.entries, courseMap, lecturersBySessionMap, studentGroupsByCourseMap]);

  // Compute available weeks from entry dates and initialise the selected week
  const availableWeeks = useMemo(() => buildWeekList(entryData.map((e) => e.date)), [entryData]);

  // Once we have weeks, initialise to the first week that has entries, or current week if it exists
  useEffect(() => {
    if (availableWeeks.length === 0) return;
    if (selectedWeekKey !== null) return; // already set

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

  // Build unique lecturer options from the session lecturer data returned by the router
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

  // Build unique course options from the entries present in this schedule
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

  // Filter function: returns true if entry matches all active filters
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

  const handleDownloadPdf = useCallback(() => {
    // PDF exports all weeks (all entries), then applies active column filters
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

  // Loading state
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

  // Pending / Solving state
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

  // Infeasible state
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

  // Failed state
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

  // Solved state -- show the timetable
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
        <h1 className="text-3xl font-bold tracking-tight">
          {schedule.name ?? 'Untitled Schedule'}
        </h1>
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

      {/* Timetable Grid — scoped to the selected week */}
      <TimetableGrid
        entries={weekFilteredEntries}
        onEntryClick={handleEntryClick}
        filterFn={hasActiveFilters ? filterFn : undefined}
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
    </div>
  );
}
