'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Clock, Download, Hash, Loader2, Plus, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScheduleStatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/trpc/client';
import { detectConflicts, type Conflict } from '@/lib/schedules/conflicts';

import { AddEntryDialog } from '@/components/schedules/add-entry-dialog';
import { ConflictWarningDialog } from '@/components/schedules/conflict-warning-dialog';
import { EntryDetailDialog } from '@/components/schedules/entry-detail-dialog';
import { EventDetailDialog } from '@/components/schedules/event-detail-dialog';
import type { ScheduleEventData } from '@/components/schedules/event-card';
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

import type { Scope, ScopePreview } from '@/components/schedules/move-scope-dialog';

function isoWeekKeyFromDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  const temp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  temp.setUTCDate(temp.getUTCDate() + 4 - (temp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${temp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const DAY_INDEX: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function resolveTargetTimeSlotId(
  allTimeSlots: Array<{ id: string; date: string; startTime: string }> | undefined,
  anchorDate: string,
  targetDayOfWeek: string,
  targetStartTime: string,
): string | null {
  if (!allTimeSlots) return null;
  const targetDayIdx = DAY_INDEX[targetDayOfWeek];
  if (!targetDayIdx) return null;
  const anchorDt = new Date(anchorDate + 'T00:00:00Z');
  const anchorDayIdx = anchorDt.getUTCDay() === 0 ? 7 : anchorDt.getUTCDay();
  const targetDt = new Date(anchorDt);
  targetDt.setUTCDate(anchorDt.getUTCDate() + (targetDayIdx - anchorDayIdx));
  const targetDate = targetDt.toISOString().slice(0, 10);
  const targetMin = toMinutes(targetStartTime);

  const daySlots = allTimeSlots.filter((ts) => ts.date === targetDate);
  if (daySlots.length === 0) return null;

  let best: { id: string; delta: number } | null = null;
  for (const ts of daySlots) {
    const delta = Math.abs(toMinutes(ts.startTime) - targetMin);
    if (!best || delta < best.delta) {
      best = { id: ts.id, delta };
    }
  }
  return best && best.delta <= 45 ? best.id : null;
}

interface AddCandidate {
  sessionId: string;
  startTimeSlotId: string;
  roomId: string;
  assignedLecturerId: string | null;
}

interface ComputeScopePreviewsParams {
  anchorEntry?: ScheduleEntryData;
  action: 'move' | 'delete' | 'add';
  moveTargetSlot?: { dayOfWeek: string; startTime: string };
  addCandidate?: AddCandidate;
  allEntries: ScheduleEntryData[];
  sessions: Array<{
    id: string;
    sessionType: string;
    requiredRoomType?: string;
    durationSlots: number;
    lecturerIds: string[];
    studentGroupIds: string[];
  }>;
  rooms: Array<{ id: string; capacity: number; roomType: string }>;
  timeSlots: Array<{ id: string; dayOfWeek: string; startTime: string; endTime: string; date: string }>;
  studentGroups: Array<{ id: string; size: number }>;
  assignedLecturerByEntryId: Map<string, string | null>;
  baselineConflictCount: number;
}

function computeScopePreviews({
  anchorEntry,
  action,
  moveTargetSlot,
  addCandidate,
  allEntries,
  sessions,
  rooms,
  timeSlots,
  studentGroups,
  assignedLecturerByEntryId,
  baselineConflictCount,
}: ComputeScopePreviewsParams): ScopePreview[] {
  // For 'add', we derive the anchor from the addCandidate's startTimeSlotId slot data
  let anchorDate: string;
  let anchorWeekKey: string;

  if (action === 'add' && addCandidate) {
    const anchorSlot = timeSlots.find((ts) => ts.id === addCandidate.startTimeSlotId);
    anchorDate = anchorSlot?.date ?? '';
    anchorWeekKey = anchorDate ? isoWeekKeyFromDate(anchorDate) : '';
  } else if (anchorEntry) {
    anchorDate = anchorEntry.date;
    anchorWeekKey = isoWeekKeyFromDate(anchorDate);
  } else {
    return [];
  }

  if (action === 'add' && addCandidate) {
    // For add: pivot is the anchor week; scope determines which ALL-SLOT weeks to add to
    const anchorSlot = timeSlots.find((ts) => ts.id === addCandidate.startTimeSlotId);
    if (!anchorSlot) return [];

    // Build weekGroups from all time slots (so we know which weeks exist)
    const allWeekGroups = new Map<string, typeof timeSlots>();
    for (const ts of timeSlots) {
      const wk = isoWeekKeyFromDate(ts.date);
      const group = allWeekGroups.get(wk) ?? [];
      group.push(ts);
      allWeekGroups.set(wk, group);
    }

    const minDateByWeek = new Map<string, string>();
    for (const [wk, slots] of allWeekGroups.entries()) {
      const min = slots.reduce((acc, s) => (s.date < acc ? s.date : acc), slots[0]!.date);
      minDateByWeek.set(wk, min);
    }

    const scopeWeekKeys: Record<Scope, string[]> = {
      this: [anchorWeekKey],
      future: [...allWeekGroups.keys()].filter((k) => (minDateByWeek.get(k) ?? '') >= anchorDate),
      past: [...allWeekGroups.keys()].filter((k) => (minDateByWeek.get(k) ?? '') <= anchorDate),
      all: [...allWeekGroups.keys()],
    };

    const sessionInfo = sessions.find((s) => s.id === addCandidate.sessionId);
    const durationSlots = sessionInfo?.durationSlots ?? 1;

    // Find the session's student groups and lecturers for the hypothetical entry
    const addedLecturerId = addCandidate.assignedLecturerId;

    let syntheticEntryCounter = 0;

    const allScopes: Scope[] = ['this', 'future', 'past', 'all'];
    return allScopes.map((scope) => {
      const targetWeekKeys = new Set(scopeWeekKeys[scope]);

      // For each target week, fabricate synthetic entries (durationSlots per week)
      const syntheticEntries: ScheduleEntryData[] = [];
      for (const wk of targetWeekKeys) {
        const weekSlots = (allWeekGroups.get(wk) ?? [])
          .filter((s) => s.dayOfWeek === anchorSlot.dayOfWeek)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        const startIdx = weekSlots.findIndex(
          (s) => s.startTime === anchorSlot.startTime,
        );
        if (startIdx === -1 || startIdx + durationSlots > weekSlots.length) continue;
        const targetSlots = weekSlots.slice(startIdx, startIdx + durationSlots);
        for (const ts of targetSlots) {
          syntheticEntryCounter++;
          syntheticEntries.push({
            entryId: `__synthetic_${syntheticEntryCounter}`,
            sessionId: addCandidate.sessionId,
            courseCode: '',
            courseName: '',
            courseId: '',
            sessionType: (sessionInfo?.sessionType as 'lecture' | 'tutorial' | 'lab') ?? 'lecture',
            roomName: '',
            roomId: addCandidate.roomId,
            timeSlotId: ts.id,
            date: ts.date,
            dayOfWeek: ts.dayOfWeek,
            startTime: ts.startTime,
            endTime: ts.endTime,
            durationSlots,
            lecturerIds: sessionInfo?.lecturerIds ?? [],
            studentGroupIds: sessionInfo?.studentGroupIds ?? [],
          });
        }
      }

      const entryCount = syntheticEntries.length;
      const hypotheticalEntries = [...allEntries, ...syntheticEntries];

      const syntheticLecturerMap = new Map(assignedLecturerByEntryId);
      for (const se of syntheticEntries) {
        syntheticLecturerMap.set(se.entryId, addedLecturerId);
      }

      const hypotheticalConflicts = detectConflicts({
        entries: hypotheticalEntries.map((e) => ({
          id: e.entryId,
          sessionId: e.sessionId,
          roomId: e.roomId,
          timeSlotId: e.timeSlotId,
          assignedLecturerId: syntheticLecturerMap.get(e.entryId) ?? null,
        })),
        sessions,
        rooms,
        timeSlots: timeSlots.map((ts) => ({
          id: ts.id,
          dayOfWeek: ts.dayOfWeek,
          startTime: ts.startTime,
          endTime: ts.endTime,
          date: ts.date ?? '',
        })),
        studentGroups,
        lecturerAvailability: new Map(),
      });

      const newConflictCount = Math.max(0, hypotheticalConflicts.length - baselineConflictCount);
      return { scope, entryCount, newConflictCount };
    });
  }

  // Original move/delete path — anchorEntry is guaranteed here
  if (!anchorEntry) return [];

  const weekGroups = new Map<string, ScheduleEntryData[]>();
  for (const e of allEntries) {
    if (e.sessionId !== anchorEntry.sessionId) continue;
    const wk = isoWeekKeyFromDate(e.date);
    const existing = weekGroups.get(wk) ?? [];
    existing.push(e);
    weekGroups.set(wk, existing);
  }

  const minDateByWeek = new Map<string, string>();
  for (const [wk, entries] of weekGroups.entries()) {
    const min = entries.reduce((acc, e) => (e.date < acc ? e.date : acc), entries[0]!.date);
    minDateByWeek.set(wk, min);
  }

  const scopeWeekKeys: Record<Scope, string[]> = {
    this: [anchorWeekKey],
    future: [...weekGroups.keys()].filter((k) => (minDateByWeek.get(k) ?? '') >= anchorDate),
    past: [...weekGroups.keys()].filter((k) => (minDateByWeek.get(k) ?? '') <= anchorDate),
    all: [...weekGroups.keys()],
  };

  const allScopes: Scope[] = ['this', 'future', 'past', 'all'];
  return allScopes.map((scope) => {
    const targetWeekKeys = new Set(scopeWeekKeys[scope]);
    const affectedSessionEntries = allEntries.filter(
      (e) => e.sessionId === anchorEntry.sessionId && targetWeekKeys.has(isoWeekKeyFromDate(e.date)),
    );
    const entryCount = affectedSessionEntries.length;

    let hypotheticalEntries: ScheduleEntryData[];
    if (action === 'delete') {
      const affectedIds = new Set(affectedSessionEntries.map((e) => e.entryId));
      hypotheticalEntries = allEntries.filter((e) => !affectedIds.has(e.entryId));
    } else if (moveTargetSlot) {
      hypotheticalEntries = allEntries.map((e) => {
        if (e.sessionId !== anchorEntry.sessionId) return e;
        const wk = isoWeekKeyFromDate(e.date);
        if (!targetWeekKeys.has(wk)) return e;
        const newTs = timeSlots.find(
          (ts) =>
            ts.dayOfWeek === moveTargetSlot.dayOfWeek &&
            ts.startTime.slice(0, 5) === moveTargetSlot.startTime &&
            isoWeekKeyFromDate(ts.date) === wk,
        );
        if (!newTs) return e;
        return {
          ...e,
          timeSlotId: newTs.id,
          dayOfWeek: newTs.dayOfWeek,
          startTime: newTs.startTime,
          endTime: newTs.endTime,
          date: newTs.date,
        };
      });
    } else {
      hypotheticalEntries = allEntries;
    }

    const hypotheticalConflicts = detectConflicts({
      entries: hypotheticalEntries.map((e) => ({
        id: e.entryId,
        sessionId: e.sessionId,
        roomId: e.roomId,
        timeSlotId: e.timeSlotId,
        assignedLecturerId: assignedLecturerByEntryId.get(e.entryId) ?? null,
      })),
      sessions,
      rooms,
      timeSlots: timeSlots.map((ts) => ({
        id: ts.id,
        dayOfWeek: ts.dayOfWeek,
        startTime: ts.startTime,
        endTime: ts.endTime,
        date: ts.date ?? '',
      })),
      studentGroups,
      lecturerAvailability: new Map(),
    });

    const newConflictCount = Math.max(0, hypotheticalConflicts.length - baselineConflictCount);
    return { scope, entryCount, newConflictCount };
  });
}

interface ComputeNewConflictsForScopeParams {
  scope: Scope;
  anchorEntry: ScheduleEntryData;
  targetDayOfWeek: string;
  targetStartTime: string;
  allEntries: ScheduleEntryData[];
  sessions: Array<{
    id: string;
    sessionType: string;
    requiredRoomType?: string;
    durationSlots: number;
    lecturerIds: string[];
    studentGroupIds: string[];
  }>;
  rooms: Array<{ id: string; capacity: number; roomType: string }>;
  timeSlots: Array<{ id: string; dayOfWeek: string; startTime: string; endTime: string; date: string }>;
  studentGroups: Array<{ id: string; size: number }>;
  assignedLecturerByEntryId: Map<string, string | null>;
  baselineConflicts: Conflict[];
}

/**
 * Returns the new Conflict objects introduced by moving the anchor session
 * entries within the given scope. Used to populate the conflict-warning dialog
 * with scope-accurate messages (not just a single-week snapshot).
 */
function computeNewConflictsForScope({
  scope,
  anchorEntry,
  targetDayOfWeek,
  targetStartTime,
  allEntries,
  sessions,
  rooms,
  timeSlots,
  studentGroups,
  assignedLecturerByEntryId,
  baselineConflicts,
}: ComputeNewConflictsForScopeParams): Conflict[] {
  const anchorDate = anchorEntry.date;
  const anchorWeekKey = isoWeekKeyFromDate(anchorDate);

  const weekGroups = new Map<string, ScheduleEntryData[]>();
  for (const e of allEntries) {
    if (e.sessionId !== anchorEntry.sessionId) continue;
    const wk = isoWeekKeyFromDate(e.date);
    const existing = weekGroups.get(wk) ?? [];
    existing.push(e);
    weekGroups.set(wk, existing);
  }

  const minDateByWeek = new Map<string, string>();
  for (const [wk, entries] of weekGroups.entries()) {
    const min = entries.reduce((acc, e) => (e.date < acc ? e.date : acc), entries[0]!.date);
    minDateByWeek.set(wk, min);
  }

  const scopeWeekKeys: Record<Scope, string[]> = {
    this: [anchorWeekKey],
    future: [...weekGroups.keys()].filter((k) => (minDateByWeek.get(k) ?? '') >= anchorDate),
    past: [...weekGroups.keys()].filter((k) => (minDateByWeek.get(k) ?? '') <= anchorDate),
    all: [...weekGroups.keys()],
  };
  const targetWeekKeys = new Set(scopeWeekKeys[scope]);

  const hypotheticalEntries = allEntries.map((e) => {
    if (e.sessionId !== anchorEntry.sessionId) return e;
    const wk = isoWeekKeyFromDate(e.date);
    if (!targetWeekKeys.has(wk)) return e;
    const newTs = timeSlots.find(
      (ts) =>
        ts.dayOfWeek === targetDayOfWeek &&
        ts.startTime.slice(0, 5) === targetStartTime &&
        isoWeekKeyFromDate(ts.date) === wk,
    );
    if (!newTs) return e;
    return { ...e, timeSlotId: newTs.id, dayOfWeek: newTs.dayOfWeek, startTime: newTs.startTime, endTime: newTs.endTime, date: newTs.date };
  });

  const hypotheticalConflicts = detectConflicts({
    entries: hypotheticalEntries.map((e) => ({
      id: e.entryId,
      sessionId: e.sessionId,
      roomId: e.roomId,
      timeSlotId: e.timeSlotId,
      assignedLecturerId: assignedLecturerByEntryId.get(e.entryId) ?? null,
    })),
    sessions,
    rooms,
    timeSlots: timeSlots.map((ts) => ({ id: ts.id, dayOfWeek: ts.dayOfWeek, startTime: ts.startTime, endTime: ts.endTime, date: ts.date ?? '' })),
    studentGroups,
    lecturerAvailability: new Map(),
  });

  const existingMessages = new Set(baselineConflicts.map((c) => c.message));
  return hypotheticalConflicts.filter((c) => !existingMessages.has(c.message));
}

interface PendingDrop {
  entry: ScheduleEntryData;
  targetDayOfWeek: string;
  targetStartTime: string;
  newConflicts: Conflict[];
  previews: ScopePreview[];
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

  const deleteEntry = api.schedules.deleteEntry.useMutation({
    onSuccess: ({ deletedCount }) => {
      utils.schedules.getById.invalidate({ id: scheduleId });
      toast({ title: 'Entry deleted', description: `${deletedCount} schedule ${deletedCount === 1 ? 'entry' : 'entries'} deleted.` });
    },
    onError: (error) => {
      toast({ title: 'Failed to delete entry', description: error.message, variant: 'destructive' });
    },
  });

  const createEntry = api.schedules.createEntry.useMutation({
    onSuccess: ({ insertedCount, skippedWeeks }) => {
      utils.schedules.getById.invalidate({ id: scheduleId });
      const desc = skippedWeeks.length > 0
        ? `; skipped ${skippedWeeks.length} week${skippedWeeks.length === 1 ? '' : 's'} (no fit)`
        : '';
      toast({ title: `Added ${insertedCount} entr${insertedCount === 1 ? 'y' : 'ies'}`, description: desc || undefined });
      setPendingAdd(null);
    },
    onError: (error) => {
      toast({ title: 'Failed to add entry', description: error.message, variant: 'destructive' });
    },
  });

  const createEvent = api.schedules.createEvent.useMutation({
    onSuccess: () => {
      utils.schedules.getById.invalidate({ id: scheduleId });
      toast({ title: 'Event added' });
    },
    onError: (error) => {
      toast({ title: 'Failed to add event', description: error.message, variant: 'destructive' });
    },
  });

  const deleteEvent = api.schedules.deleteEvent.useMutation({
    onSuccess: () => {
      utils.schedules.getById.invalidate({ id: scheduleId });
      toast({ title: 'Event deleted' });
    },
    onError: (error) => {
      toast({ title: 'Failed to delete event', description: error.message, variant: 'destructive' });
    },
  });

  // Filters (multi-select — empty array = no filter for that category)
  const [selectedLecturers, setSelectedLecturers] = useState<string[]>([]);
  const [selectedStudentGroups, setSelectedStudentGroups] = useState<string[]>([]);
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [showConflictsOnly, setShowConflictsOnly] = useState(false);

  // Week navigation
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);

  // Entry detail dialog
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntryData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // DnD drop flow state
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);

  // Delete flow state
  const [pendingDelete, setPendingDelete] = useState<{ entry: ScheduleEntryData; previews: ScopePreview[] } | null>(null);
  const [deleteScopeDialogOpen, setDeleteScopeDialogOpen] = useState(false);

  // Add entry flow state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<{ dayOfWeek: string; startTime: string; date?: string } | null>(null);
  const [pendingAdd, setPendingAdd] = useState<{ values: AddCandidate; previews: ScopePreview[] } | null>(null);
  const [addScopeDialogOpen, setAddScopeDialogOpen] = useState(false);

  // Event dialog state
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEventData | null>(null);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);

  // Scope chosen in the scope dialog, held while conflict confirmation is shown
  const [pendingMoveScope, setPendingMoveScope] = useState<Scope | null>(null);
  const [pendingMoveConflicts, setPendingMoveConflicts] = useState<Conflict[]>([]);

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

  // Build entryId → assignedLecturerId from raw schedule entries
  const assignedLecturerByEntryId = useMemo(() => {
    const map = new Map<string, string | null>();
    if (!schedule?.entries) return map;
    for (const e of schedule.entries) {
      map.set(e.entry.id, e.assignedLecturerId ?? null);
    }
    return map;
  }, [schedule?.entries]);

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
        assignedLecturerName: e.assignedLecturerName ?? null,
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

  // Sessions for AddEntryDialog — flatten courses.sessions with lecturerIds
  const addEntrySessions = useMemo(() => {
    if (!courses) return [];
    return courses.flatMap((course) =>
      course.sessions.map((s) => ({
        id: s.id,
        courseCode: course.code,
        courseName: course.name,
        sessionType: s.sessionType as 'lecture' | 'tutorial' | 'lab',
        durationSlots: s.durationSlots,
        lecturerIds: s.lecturers.map((l) => l.userId),
      })),
    );
  }, [courses]);

  // Lecturers by id from schedule data — Map<userId, {firstName, lastName, email}>
  const lecturersById = useMemo(() => {
    const map = new Map<string, { firstName: string | null; lastName: string | null; email: string }>();
    if (!schedule?.lecturersBySession) return map;
    for (const l of schedule.lecturersBySession) {
      if (!map.has(l.lecturerId)) {
        map.set(l.lecturerId, { firstName: l.firstName, lastName: l.lastName, email: '' });
      }
    }
    return map;
  }, [schedule?.lecturersBySession]);

  // Rooms for AddEntryDialog
  const addEntryRooms = useMemo(
    () =>
      (allRooms ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        capacity: r.capacity,
        roomType: r.roomType,
        building: r.building ?? null,
      })),
    [allRooms],
  );

  const resolveName = useMemo(() => {
    const roomNameById = new Map(allRooms?.map((r) => [r.id, r.name]) ?? []);
    const sgNameById = new Map(studentGroups?.map((sg) => [sg.id, sg.name]) ?? []);
    const lecturerNameById = new Map<string, string>();
    if (schedule?.lecturersBySession) {
      for (const l of schedule.lecturersBySession) {
        if (!lecturerNameById.has(l.lecturerId)) {
          const name = [l.firstName, l.lastName].filter(Boolean).join(' ');
          if (name) lecturerNameById.set(l.lecturerId, name);
        }
      }
    }
    return (kind: 'room' | 'lecturer' | 'student_group', id: string): string | undefined => {
      if (kind === 'room') return roomNameById.get(id);
      if (kind === 'lecturer') return lecturerNameById.get(id);
      return sgNameById.get(id);
    };
  }, [allRooms, studentGroups, schedule?.lecturersBySession]);

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
      entries: entryData.map((e) => ({ id: e.entryId, sessionId: e.sessionId, roomId: e.roomId, timeSlotId: e.timeSlotId, assignedLecturerId: assignedLecturerByEntryId.get(e.entryId) ?? null })),
      sessions: conflictInputSessions,
      rooms: roomList,
      timeSlots: tsList,
      studentGroups: sgList,
      lecturerAvailability: new Map(),
      resolveName,
    });
  }, [entryData, conflictInputSessions, allRooms, allTimeSlots, studentGroups, schedule?.entries, resolveName, assignedLecturerByEntryId]);

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

  const entryLookup = useMemo(
    () => new Map(entryData.map((e) => [e.entryId, e])),
    [entryData],
  );

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
      if (selectedRooms.length > 0 && !selectedRooms.includes(entry.roomId)) return false;
      if (
        selectedLecturers.length > 0 &&
        !selectedLecturers.some((id) => entry.lecturerIds?.includes(id))
      )
        return false;
      if (
        selectedStudentGroups.length > 0 &&
        !selectedStudentGroups.some((id) => entry.studentGroupIds?.includes(id))
      )
        return false;
      if (selectedCourses.length > 0 && !selectedCourses.includes(entry.courseId)) return false;
      if (showConflictsOnly && !conflictedEntryIds.has(entry.entryId)) return false;
      return true;
    },
    [selectedRooms, selectedLecturers, selectedStudentGroups, selectedCourses, showConflictsOnly, conflictedEntryIds],
  );

  const hasActiveFilters =
    selectedLecturers.length > 0 ||
    selectedStudentGroups.length > 0 ||
    selectedRooms.length > 0 ||
    selectedCourses.length > 0 ||
    showConflictsOnly;

  const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  function dowOf(dateStr: string): string {
    return DAY_NAMES[new Date(dateStr + 'T00:00:00Z').getUTCDay()] ?? 'monday';
  }

  const eventsForCurrentWeek = useMemo((): ScheduleEventData[] => {
    if (!schedule?.events || !selectedWeekKey) return [];
    return schedule.events
      .filter((ev) => isoWeekKey(ev.date) === selectedWeekKey)
      .map((ev) => ({ ...ev, dayOfWeek: dowOf(ev.date) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?.events, selectedWeekKey]);

  function handleEntryClick(entry: ScheduleEntryData) {
    setSelectedEntry(entry);
    setDialogOpen(true);
  }

  function handleEntryDrop(
    entry: ScheduleEntryData,
    targetDayOfWeek: string,
    targetStartTime: string,
  ) {
    if (entry.dayOfWeek === targetDayOfWeek && entry.startTime.slice(0, 5) === targetStartTime) return;

    const targetTimeSlotId = resolveTargetTimeSlotId(
      allTimeSlots,
      entry.date,
      targetDayOfWeek,
      targetStartTime,
    );
    if (!targetTimeSlotId) return;

    const roomList = allRooms?.map((r) => ({ id: r.id, capacity: r.capacity, roomType: r.roomType })) ?? [];
    const tsList = allTimeSlots?.map((ts) => ({
      id: ts.id, dayOfWeek: ts.dayOfWeek, startTime: ts.startTime, endTime: ts.endTime, date: ts.date,
    })) ?? [];
    const sgList = studentGroups?.map((sg) => ({ id: sg.id, size: sg.size })) ?? [];

    const previews = computeScopePreviews({
      anchorEntry: entry,
      action: 'move',
      moveTargetSlot: { dayOfWeek: targetDayOfWeek, startTime: targetStartTime },
      allEntries: entryData,
      sessions: conflictInputSessions,
      rooms: roomList,
      timeSlots: tsList,
      studentGroups: sgList,
      assignedLecturerByEntryId,
      baselineConflictCount: conflicts.length,
    });

    const thisPreview = previews.find((p) => p.scope === 'this');
    const newlyIntroduced: Conflict[] = [];
    if (thisPreview && thisPreview.newConflictCount > 0) {
      const hypotheticalEntries = weekFilteredEntries.map((e) => {
        if (e.sessionId === entry.sessionId) {
          return { ...e, timeSlotId: targetTimeSlotId, dayOfWeek: targetDayOfWeek, startTime: targetStartTime };
        }
        return e;
      });
      const newConflicts = detectConflicts({
        entries: hypotheticalEntries.map((e) => ({
          id: e.entryId,
          sessionId: e.sessionId,
          roomId: e.roomId,
          timeSlotId: e.timeSlotId,
          assignedLecturerId: assignedLecturerByEntryId.get(e.entryId) ?? null,
        })),
        sessions: conflictInputSessions,
        rooms: roomList,
        timeSlots: tsList,
        studentGroups: sgList,
        lecturerAvailability: new Map(),
      });
      const existingMessages = new Set(conflicts.map((c) => c.message));
      newlyIntroduced.push(...newConflicts.filter((c) => !existingMessages.has(c.message)));
    }

    setPendingDrop({ entry, targetDayOfWeek, targetStartTime, newConflicts: newlyIntroduced, previews });
    setScopeDialogOpen(true);
  }

  function executeMoveEntry(scope: Scope) {
    if (!pendingDrop) return;

    const targetTimeSlotId = resolveTargetTimeSlotId(
      allTimeSlots,
      pendingDrop.entry.date,
      pendingDrop.targetDayOfWeek,
      pendingDrop.targetStartTime,
    );
    if (!targetTimeSlotId) return;

    moveEntry.mutate({
      scheduleId,
      sessionId: pendingDrop.entry.sessionId,
      currentTimeSlotId: pendingDrop.entry.timeSlotId,
      newStartTimeSlotId: targetTimeSlotId,
      scope,
    });

    setPendingDrop(null);
  }

  function handleConflictCancel() {
    setPendingDrop(null);
    setPendingMoveScope(null);
    setPendingMoveConflicts([]);
    setConflictDialogOpen(false);
  }

  function handleMoveScopeSelect(scope: Scope) {
    if (!pendingDrop) return;
    const preview = pendingDrop.previews.find((p) => p.scope === scope);
    if (preview && preview.newConflictCount > 0) {
      // Re-compute conflict details for the chosen scope so the warning dialog
      // shows the correct count and messages (not just the single-week snapshot).
      const roomList = allRooms?.map((r) => ({ id: r.id, capacity: r.capacity, roomType: r.roomType })) ?? [];
      const tsList = allTimeSlots?.map((ts) => ({
        id: ts.id, dayOfWeek: ts.dayOfWeek, startTime: ts.startTime, endTime: ts.endTime, date: ts.date,
      })) ?? [];
      const sgList = studentGroups?.map((sg) => ({ id: sg.id, size: sg.size })) ?? [];
      const scopeConflicts = computeNewConflictsForScope({
        scope,
        anchorEntry: pendingDrop.entry,
        targetDayOfWeek: pendingDrop.targetDayOfWeek,
        targetStartTime: pendingDrop.targetStartTime,
        allEntries: entryData,
        sessions: conflictInputSessions,
        rooms: roomList,
        timeSlots: tsList,
        studentGroups: sgList,
        assignedLecturerByEntryId,
        baselineConflicts: conflicts,
      });

      setPendingMoveScope(scope);
      setPendingMoveConflicts(scopeConflicts);
      setConflictDialogOpen(true);
      return;
    }
    executeMoveEntry(scope);
  }

  function handleConflictConfirmAndMove() {
    setConflictDialogOpen(false);
    if (!pendingDrop || !pendingMoveScope) return;
    const scope = pendingMoveScope;
    setPendingMoveScope(null);
    executeMoveEntry(scope);
  }

  function handleDeleteEntry(entry: ScheduleEntryData) {
    const roomList = allRooms?.map((r) => ({ id: r.id, capacity: r.capacity, roomType: r.roomType })) ?? [];
    const tsList = allTimeSlots?.map((ts) => ({
      id: ts.id, dayOfWeek: ts.dayOfWeek, startTime: ts.startTime, endTime: ts.endTime, date: ts.date,
    })) ?? [];
    const sgList = studentGroups?.map((sg) => ({ id: sg.id, size: sg.size })) ?? [];

    const previews = computeScopePreviews({
      anchorEntry: entry,
      action: 'delete',
      allEntries: entryData,
      sessions: conflictInputSessions,
      rooms: roomList,
      timeSlots: tsList,
      studentGroups: sgList,
      assignedLecturerByEntryId,
      baselineConflictCount: conflicts.length,
    });

    setPendingDelete({ entry, previews });
    setDeleteScopeDialogOpen(true);
  }

  function handleDeleteScopeSelect(scope: Scope) {
    if (!pendingDelete) return;
    deleteEntry.mutate({
      scheduleId,
      sessionId: pendingDelete.entry.sessionId,
      currentTimeSlotId: pendingDelete.entry.timeSlotId,
      scope,
    });
    setPendingDelete(null);
  }

  function handleAddAt(dayOfWeek: string, startMinutes: number) {
    const hh = String(Math.floor(startMinutes / 60)).padStart(2, '0');
    const mm = String(startMinutes % 60).padStart(2, '0');
    const startTime = `${hh}:${mm}`;

    let date: string | undefined;
    if (selectedWeekKey && allTimeSlots) {
      const ts = allTimeSlots.find(
        (s) => s.dayOfWeek === dayOfWeek && isoWeekKey(s.date) === selectedWeekKey,
      );
      if (ts) date = ts.date;
    }

    setAddPrefill({ dayOfWeek, startTime, date });
    setAddDialogOpen(true);
  }

  function handleAddEntrySubmit(values: AddCandidate) {
    const roomList = allRooms?.map((r) => ({ id: r.id, capacity: r.capacity, roomType: r.roomType })) ?? [];
    const tsList = allTimeSlots?.map((ts) => ({
      id: ts.id, dayOfWeek: ts.dayOfWeek, startTime: ts.startTime, endTime: ts.endTime, date: ts.date,
    })) ?? [];
    const sgList = studentGroups?.map((sg) => ({ id: sg.id, size: sg.size })) ?? [];

    // Build a full session list that includes the new session being added
    const sessionTypeToRoomType: Record<string, string> = {
      lecture: 'lecture_hall',
      tutorial: 'tutorial_room',
      lab: 'lab',
    };
    const newSessionInfo = addEntrySessions.find((s) => s.id === values.sessionId);
    const existingSessionIds = new Set(conflictInputSessions.map((s) => s.id));
    const sessionsForConflicts = [
      ...conflictInputSessions,
      ...(newSessionInfo && !existingSessionIds.has(newSessionInfo.id)
        ? [{
            id: newSessionInfo.id,
            sessionType: newSessionInfo.sessionType,
            requiredRoomType: sessionTypeToRoomType[newSessionInfo.sessionType],
            durationSlots: newSessionInfo.durationSlots,
            lecturerIds: newSessionInfo.lecturerIds,
            studentGroupIds: [],
          }]
        : []),
    ];

    const previews = computeScopePreviews({
      action: 'add',
      addCandidate: values,
      allEntries: entryData,
      sessions: sessionsForConflicts,
      rooms: roomList,
      timeSlots: tsList,
      studentGroups: sgList,
      assignedLecturerByEntryId,
      baselineConflictCount: conflicts.length,
    });

    setPendingAdd({ values, previews });
    setAddScopeDialogOpen(true);
  }

  function handleAddEventSubmit(values: { title: string; date: string; startTime: string; endTime: string; roomId: string | null }) {
    createEvent.mutate({ scheduleId, ...values });
  }

  function handleAddScopeSelect(scope: Scope) {
    if (!pendingAdd) return;
    createEntry.mutate({
      scheduleId,
      sessionId: pendingAdd.values.sessionId,
      startTimeSlotId: pendingAdd.values.startTimeSlotId,
      roomId: pendingAdd.values.roomId,
      assignedLecturerId: pendingAdd.values.assignedLecturerId,
      scope,
    });
  }

  const handleDownloadPdf = useCallback(() => {
    const filtered = hasActiveFilters ? entryData.filter(filterFn!) : entryData;

    const filterLabels: string[] = [];
    const labelsFor = (ids: string[], opts: { id: string; label: string }[], heading: string) => {
      if (ids.length === 0) return;
      const labels = ids
        .map((id) => opts.find((o) => o.id === id)?.label)
        .filter((l): l is string => !!l);
      if (labels.length > 0) filterLabels.push(`${heading}: ${labels.join(', ')}`);
    };
    labelsFor(selectedLecturers, lecturerOptions, 'Lecturers');
    labelsFor(selectedStudentGroups, studentGroupOptions, 'Student Groups');
    labelsFor(selectedRooms, roomOptions, 'Rooms');
    labelsFor(selectedCourses, courseOptions, 'Courses');

    exportSchedulePdf({
      entries: filtered,
      scheduleName: schedule?.name ?? 'Schedule',
      filterLabels,
    });
  }, [entryData, hasActiveFilters, filterFn, selectedLecturers, selectedStudentGroups, selectedRooms, selectedCourses, lecturerOptions, studentGroupOptions, roomOptions, courseOptions, schedule?.name]);

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
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setAddPrefill(null); setAddDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Add entry
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      {/* Filters */}
      <TimetableFilters
        lecturers={lecturerOptions}
        studentGroups={studentGroupOptions}
        rooms={roomOptions}
        courses={courseOptions}
        selectedLecturers={selectedLecturers}
        selectedStudentGroups={selectedStudentGroups}
        selectedRooms={selectedRooms}
        selectedCourses={selectedCourses}
        onLecturersChange={setSelectedLecturers}
        onStudentGroupsChange={setSelectedStudentGroups}
        onRoomsChange={setSelectedRooms}
        onCoursesChange={setSelectedCourses}
        showConflictsOnly={showConflictsOnly}
        onShowConflictsOnlyChange={setShowConflictsOnly}
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
        onEmptyCellClick={handleAddAt}
        events={eventsForCurrentWeek}
        onEventClick={(ev) => { setSelectedEvent(ev); setEventDialogOpen(true); }}
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
        conflicts={conflictsByEntryId.get(selectedEntry?.entryId ?? '') ?? []}
        entryLookup={entryLookup}
        onJumpToEntry={(e) => { setSelectedEntry(e); }}
        onDelete={handleDeleteEntry}
      />

      {/* Conflict warning dialog */}
      <ConflictWarningDialog
        open={conflictDialogOpen}
        onOpenChange={setConflictDialogOpen}
        conflicts={pendingMoveConflicts}
        onConfirm={handleConflictConfirmAndMove}
        onCancel={handleConflictCancel}
      />

      {/* Move scope dialog */}
      <MoveScopeDialog
        open={scopeDialogOpen}
        onOpenChange={setScopeDialogOpen}
        mode="move"
        previews={pendingDrop?.previews ?? []}
        onSelect={handleMoveScopeSelect}
      />

      {/* Delete scope dialog */}
      <MoveScopeDialog
        open={deleteScopeDialogOpen}
        onOpenChange={setDeleteScopeDialogOpen}
        mode="delete"
        previews={pendingDelete?.previews ?? []}
        onSelect={handleDeleteScopeSelect}
      />

      {/* Add entry dialog */}
      <AddEntryDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        prefill={addPrefill}
        sessions={addEntrySessions}
        rooms={addEntryRooms}
        timeSlots={allTimeSlots ?? []}
        lecturersById={lecturersById}
        onSubmit={handleAddEntrySubmit}
        onSubmitOther={handleAddEventSubmit}
      />

      {/* Add scope dialog */}
      <MoveScopeDialog
        open={addScopeDialogOpen}
        onOpenChange={setAddScopeDialogOpen}
        mode="add"
        previews={pendingAdd?.previews ?? []}
        onSelect={handleAddScopeSelect}
      />

      {/* Event detail dialog */}
      <EventDetailDialog
        event={selectedEvent}
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
        onDelete={(ev) => {
          deleteEvent.mutate({ eventId: ev.id });
          setEventDialogOpen(false);
        }}
      />
    </div>
  );
}
