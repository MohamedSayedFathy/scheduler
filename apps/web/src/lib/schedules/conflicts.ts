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
}

export interface ConflictInputs {
  entries: Array<{ id: string; sessionId: string; roomId: string; timeSlotId: string }>;
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
}

export function detectConflicts(inputs: ConflictInputs): Conflict[] {
  const { entries, sessions, rooms, studentGroups, lecturerAvailability } = inputs;

  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const studentGroupMap = new Map(studentGroups.map((sg) => [sg.id, sg]));

  const conflicts: Conflict[] = [];

  // Rule 1: Room double-booking — group by (roomId, timeSlotId)
  const roomTimeKey = new Map<string, { entryIds: string[]; sessionIds: string[] }>();
  for (const entry of entries) {
    const key = `${entry.roomId}::${entry.timeSlotId}`;
    const existing = roomTimeKey.get(key);
    if (existing) {
      existing.entryIds.push(entry.id);
      existing.sessionIds.push(entry.sessionId);
    } else {
      roomTimeKey.set(key, { entryIds: [entry.id], sessionIds: [entry.sessionId] });
    }
  }
  for (const { entryIds, sessionIds } of roomTimeKey.values()) {
    if (entryIds.length > 1) {
      const room = roomMap.get(entries.find((e) => entryIds.includes(e.id))!.roomId);
      conflicts.push({
        kind: 'room_double_booking',
        message: `Room "${room?.roomType ?? 'unknown'}" is double-booked at the same time slot`,
        entryIds,
        involvedSessionIds: [...new Set(sessionIds)],
      });
    }
  }

  // Rule 2: Lecturer double-booking — group by (lecturerId, timeSlotId)
  const lecturerTimeKey = new Map<string, { entryIds: string[]; sessionIds: string[] }>();
  for (const entry of entries) {
    const session = sessionMap.get(entry.sessionId);
    if (!session) continue;
    for (const lecturerId of session.lecturerIds) {
      const key = `${lecturerId}::${entry.timeSlotId}`;
      const existing = lecturerTimeKey.get(key);
      if (existing) {
        if (!existing.entryIds.includes(entry.id)) existing.entryIds.push(entry.id);
        if (!existing.sessionIds.includes(entry.sessionId)) existing.sessionIds.push(entry.sessionId);
      } else {
        lecturerTimeKey.set(key, { entryIds: [entry.id], sessionIds: [entry.sessionId] });
      }
    }
  }
  for (const [key, { entryIds, sessionIds }] of lecturerTimeKey.entries()) {
    if (sessionIds.length > 1) {
      const lecturerId = key.split('::')[0];
      conflicts.push({
        kind: 'lecturer_double_booking',
        message: `Lecturer is scheduled in multiple sessions at the same time slot`,
        entryIds,
        involvedSessionIds: sessionIds,
      });
      void lecturerId;
    }
  }

  // Rule 3: Student group double-booking — group by (studentGroupId, timeSlotId)
  const sgTimeKey = new Map<string, { entryIds: string[]; sessionIds: string[] }>();
  for (const entry of entries) {
    const session = sessionMap.get(entry.sessionId);
    if (!session) continue;
    for (const sgId of session.studentGroupIds) {
      const key = `${sgId}::${entry.timeSlotId}`;
      const existing = sgTimeKey.get(key);
      if (existing) {
        if (!existing.entryIds.includes(entry.id)) existing.entryIds.push(entry.id);
        if (!existing.sessionIds.includes(entry.sessionId)) existing.sessionIds.push(entry.sessionId);
      } else {
        sgTimeKey.set(key, { entryIds: [entry.id], sessionIds: [entry.sessionId] });
      }
    }
  }
  for (const [key, { entryIds, sessionIds }] of sgTimeKey.entries()) {
    if (sessionIds.length > 1) {
      const sgId = key.split('::')[0];
      conflicts.push({
        kind: 'student_group_double_booking',
        message: `Student group is scheduled in multiple sessions at the same time slot`,
        entryIds,
        involvedSessionIds: sessionIds,
      });
      void sgId;
    }
  }

  // Rule 4: Room capacity — sum of student group sizes must not exceed room capacity
  // Process per session (all entries for a session share the same room)
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
      const sessionEntries = sessionEntryMap.get(entry.sessionId) ?? [entry.id];
      conflicts.push({
        kind: 'room_capacity',
        message: `Room capacity ${room.capacity} exceeded by ${totalSize - room.capacity} students (${totalSize} enrolled)`,
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
      const sessionEntries = sessionEntryMap.get(entry.sessionId) ?? [entry.id];
      conflicts.push({
        kind: 'room_type_mismatch',
        message: `Session requires room type "${session.requiredRoomType}" but room has type "${room.roomType}"`,
        entryIds: sessionEntries,
        involvedSessionIds: [entry.sessionId],
      });
    }
  }

  // Rule 6: Lecturer unavailable
  const checkedUnavailKeys = new Set<string>();
  for (const entry of entries) {
    const session = sessionMap.get(entry.sessionId);
    if (!session) continue;
    for (const lecturerId of session.lecturerIds) {
      const unavailKey = `${lecturerId}::${entry.sessionId}::${entry.timeSlotId}`;
      if (checkedUnavailKeys.has(unavailKey)) continue;
      checkedUnavailKeys.add(unavailKey);

      const available = lecturerAvailability.get(lecturerId);
      if (available && !available.has(entry.timeSlotId)) {
        conflicts.push({
          kind: 'lecturer_unavailable',
          message: `Lecturer is not available at this time slot`,
          entryIds: [entry.id],
          involvedSessionIds: [entry.sessionId],
        });
      }
    }
  }

  return conflicts;
}
