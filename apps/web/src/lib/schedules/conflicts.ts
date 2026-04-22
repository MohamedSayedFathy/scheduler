export type ConflictKind =
  | 'room_double_booking'
  | 'lecturer_double_booking'
  | 'student_group_double_booking'
  | 'room_capacity'
  | 'room_type_mismatch'
  | 'lecturer_unavailable';

export interface Conflict {
  kind: ConflictKind;
  message: string;
  entryIds: string[];
  involvedSessionIds: string[];
  scope?: { kind: 'room' | 'lecturer' | 'student_group'; id: string };
}

export interface ConflictInputs {
  entries: Array<{ id: string; sessionId: string; roomId: string; timeSlotId: string; assignedLecturerId?: string | null }>;
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
  lecturerAvailability: Map<string, Set<string>>;
  resolveName?: (kind: 'room' | 'lecturer' | 'student_group', id: string) => string | undefined;
}

function toMinutes(time: string): number {
  const [h = '0', m = '0'] = time.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function formatDateShort(date: string): string {
  // date is YYYY-MM-DD; produce e.g. "Mon 2026-04-27"
  const d = new Date(date + 'T00:00:00');
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' });
  return `${day} ${date}`;
}

function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime.slice(0, 5)}–${endTime.slice(0, 5)}`;
}

export function detectConflicts(inputs: ConflictInputs): Conflict[] {
  const { entries, sessions, rooms, timeSlots, studentGroups, lecturerAvailability, resolveName } = inputs;

  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const studentGroupMap = new Map(studentGroups.map((sg) => [sg.id, sg]));
  const tsById = new Map(timeSlots.map((ts) => [ts.id, ts]));

  const conflicts: Conflict[] = [];

  // Shared helper: for each (scopeId, date) bucket, sort by startMin and emit
  // one conflict per overlapping pair (a.endMin > b.startMin).
  type BucketEntry = {
    entryId: string;
    sessionId: string;
    startMin: number;
    endMin: number;
    date: string;
    startTime: string;
    endTime: string;
  };

  function emitPairConflicts(
    buckets: Map<string, BucketEntry[]>,
    scopeKind: 'room' | 'lecturer' | 'student_group',
    buildMessage: (scopeId: string, date: string, startTime: string, endTime: string) => string,
  ) {
    for (const [bucketKey, bucketEntries] of buckets.entries()) {
      const scopeId = bucketKey.split('::')[0]!;
      bucketEntries.sort((a, b) => a.startMin - b.startMin);
      for (let i = 0; i < bucketEntries.length - 1; i++) {
        for (let j = i + 1; j < bucketEntries.length; j++) {
          const a = bucketEntries[i]!;
          const b = bucketEntries[j]!;
          // b.startMin >= a.startMin (sorted); overlap iff a ends after b starts
          if (a.endMin <= b.startMin) break; // sorted, so no later j will overlap either
          const overlapStart = b.startTime;
          const overlapEnd = a.endTime;
          conflicts.push({
            kind: scopeKind === 'room'
              ? 'room_double_booking'
              : scopeKind === 'lecturer'
                ? 'lecturer_double_booking'
                : 'student_group_double_booking',
            message: buildMessage(scopeId, a.date, overlapStart, overlapEnd),
            entryIds: [a.entryId, b.entryId],
            involvedSessionIds: [...new Set([a.sessionId, b.sessionId])],
            scope: { kind: scopeKind, id: scopeId },
          });
        }
      }
    }
  }

  // Rule 1: Room double-booking — bucket by (roomId, date)
  const roomBuckets = new Map<string, BucketEntry[]>();
  for (const entry of entries) {
    const ts = tsById.get(entry.timeSlotId);
    if (!ts) continue;
    const key = `${entry.roomId}::${ts.date}`;
    const bucket = roomBuckets.get(key) ?? [];
    bucket.push({
      entryId: entry.id,
      sessionId: entry.sessionId,
      startMin: toMinutes(ts.startTime),
      endMin: toMinutes(ts.endTime),
      date: ts.date,
      startTime: ts.startTime,
      endTime: ts.endTime,
    });
    roomBuckets.set(key, bucket);
  }
  emitPairConflicts(roomBuckets, 'room', (roomId, date, startTime, endTime) => {
    const name = resolveName?.('room', roomId) ?? roomId;
    return `Room ${name} is double-booked on ${formatDateShort(date)} ${formatTimeRange(startTime, endTime)}`;
  });

  // Rule 2: Lecturer double-booking — bucket by (effectiveLecturerId, date)
  // effectiveLecturerId = entry.assignedLecturerId ?? session.lecturerIds[0]
  const lecturerBuckets = new Map<string, BucketEntry[]>();
  for (const entry of entries) {
    const session = sessionMap.get(entry.sessionId);
    if (!session) continue;
    const ts = tsById.get(entry.timeSlotId);
    if (!ts) continue;
    const effectiveLecturerId = entry.assignedLecturerId ?? session.lecturerIds[0];
    if (!effectiveLecturerId) continue;
    const key = `${effectiveLecturerId}::${ts.date}`;
    const bucket = lecturerBuckets.get(key) ?? [];
    bucket.push({
      entryId: entry.id,
      sessionId: entry.sessionId,
      startMin: toMinutes(ts.startTime),
      endMin: toMinutes(ts.endTime),
      date: ts.date,
      startTime: ts.startTime,
      endTime: ts.endTime,
    });
    lecturerBuckets.set(key, bucket);
  }
  emitPairConflicts(lecturerBuckets, 'lecturer', (lecturerId, date, startTime, endTime) => {
    const name = resolveName?.('lecturer', lecturerId) ?? lecturerId;
    return `Lecturer ${name} teaches two sessions on ${formatDateShort(date)} ${formatTimeRange(startTime, endTime)}`;
  });

  // Rule 3: Student group double-booking — bucket by (studentGroupId, date)
  const sgBuckets = new Map<string, BucketEntry[]>();
  for (const entry of entries) {
    const session = sessionMap.get(entry.sessionId);
    if (!session) continue;
    const ts = tsById.get(entry.timeSlotId);
    if (!ts) continue;
    for (const sgId of session.studentGroupIds) {
      const key = `${sgId}::${ts.date}`;
      const bucket = sgBuckets.get(key) ?? [];
      bucket.push({
        entryId: entry.id,
        sessionId: entry.sessionId,
        startMin: toMinutes(ts.startTime),
        endMin: toMinutes(ts.endTime),
        date: ts.date,
        startTime: ts.startTime,
        endTime: ts.endTime,
      });
      sgBuckets.set(key, bucket);
    }
  }
  emitPairConflicts(sgBuckets, 'student_group', (sgId, date, startTime, endTime) => {
    const name = resolveName?.('student_group', sgId) ?? sgId;
    return `Student group ${name} has overlapping sessions on ${formatDateShort(date)} ${formatTimeRange(startTime, endTime)}`;
  });

  // Rule 4: Room capacity — sum of student group sizes must not exceed room capacity
  const sessionEntryMap = new Map<string, string[]>();
  for (const entry of entries) {
    const existing = sessionEntryMap.get(entry.sessionId) ?? [];
    if (!existing.includes(entry.id)) existing.push(entry.id);
    sessionEntryMap.set(entry.sessionId, existing);
  }
  const checkedCapacityKeys = new Set<string>();
  for (const entry of entries) {
    const capKey = `${entry.sessionId}::${entry.roomId}`;
    if (checkedCapacityKeys.has(capKey)) continue;
    checkedCapacityKeys.add(capKey);

    const session = sessionMap.get(entry.sessionId);
    const room = roomMap.get(entry.roomId);
    if (!session || !room) continue;

    const totalSize = session.studentGroupIds.reduce((sum, sgId) => {
      const sg = studentGroupMap.get(sgId);
      return sum + (sg?.size ?? 0);
    }, 0);

    if (totalSize > room.capacity) {
      const ts = tsById.get(entry.timeSlotId);
      const timeInfo = ts ? ` on ${formatDateShort(ts.date)} ${formatTimeRange(ts.startTime, ts.endTime)}` : '';
      const roomName = resolveName?.('room', entry.roomId) ?? room.roomType;
      const sessionEntries = sessionEntryMap.get(entry.sessionId) ?? [entry.id];
      conflicts.push({
        kind: 'room_capacity',
        message: `Room ${roomName} capacity ${room.capacity} exceeded by ${totalSize - room.capacity} students (${totalSize} enrolled)${timeInfo}`,
        entryIds: sessionEntries,
        involvedSessionIds: [entry.sessionId],
      });
    }
  }

  // Rule 5: Room type mismatch
  const checkedTypeKeys = new Set<string>();
  for (const entry of entries) {
    const typeKey = `${entry.sessionId}::${entry.roomId}`;
    if (checkedTypeKeys.has(typeKey)) continue;
    checkedTypeKeys.add(typeKey);

    const session = sessionMap.get(entry.sessionId);
    const room = roomMap.get(entry.roomId);
    if (!session || !room) continue;
    if (!session.requiredRoomType) continue;

    if (session.requiredRoomType !== room.roomType) {
      const ts = tsById.get(entry.timeSlotId);
      const timeInfo = ts ? ` on ${formatDateShort(ts.date)} ${formatTimeRange(ts.startTime, ts.endTime)}` : '';
      const roomName = resolveName?.('room', entry.roomId) ?? room.roomType;
      const sessionEntries = sessionEntryMap.get(entry.sessionId) ?? [entry.id];
      conflicts.push({
        kind: 'room_type_mismatch',
        message: `Room ${roomName} has type "${room.roomType}" but session requires "${session.requiredRoomType}"${timeInfo}`,
        entryIds: sessionEntries,
        involvedSessionIds: [entry.sessionId],
      });
    }
  }

  // Rule 6: Lecturer unavailable — only check the effective lecturer
  const checkedUnavailKeys = new Set<string>();
  for (const entry of entries) {
    const session = sessionMap.get(entry.sessionId);
    if (!session) continue;
    const lecturerId = entry.assignedLecturerId ?? session.lecturerIds[0];
    if (!lecturerId) continue;
    const unavailKey = `${lecturerId}::${entry.sessionId}::${entry.timeSlotId}`;
    if (checkedUnavailKeys.has(unavailKey)) continue;
    checkedUnavailKeys.add(unavailKey);

    const available = lecturerAvailability.get(lecturerId);
    if (available && !available.has(entry.timeSlotId)) {
      const ts = tsById.get(entry.timeSlotId);
      const timeInfo = ts ? ` on ${formatDateShort(ts.date)} ${formatTimeRange(ts.startTime, ts.endTime)}` : '';
      const name = resolveName?.('lecturer', lecturerId) ?? lecturerId;
      conflicts.push({
        kind: 'lecturer_unavailable',
        message: `Lecturer ${name} is not available${timeInfo}`,
        entryIds: [entry.id],
        involvedSessionIds: [entry.sessionId],
        scope: { kind: 'lecturer', id: lecturerId },
      });
    }
  }

  return conflicts;
}
