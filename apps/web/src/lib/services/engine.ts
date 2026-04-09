import { createHmac } from 'crypto';

import type { EngineSolveAcceptedResponse, EngineSolveRequest } from '@scheduler/types';
import { eq, inArray } from 'drizzle-orm';

import { env } from '@/env';
import type { Database } from '@/lib/db';
import {
  courses,
  courseSessions,
  courseStudentGroups,
  lecturerDateExceptions,
  lecturerDayExceptions,
  rooms,
  schedulingConstraints,
  sessionLecturers,
  studentGroups,
  timeSlots,
  users,
} from '@/lib/db/schema';

function getISOWeekNumber(dateStr: string): number {
  const date = new Date(dateStr + 'T00:00:00Z');
  const temp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  temp.setUTCDate(temp.getUTCDate() + 4 - (temp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export async function triggerSolve(
  db: Database,
  scheduleId: string,
  tenantId: string,
  callbackUrl: string,
): Promise<{ jobId: string }> {
  const [
    allRooms,
    allTimeSlots,
    allCourses,
    allStudentGroups,
    allUsers,
    allConstraints,
  ] = await Promise.all([
    db.select().from(rooms).where(eq(rooms.tenantId, tenantId)),
    db.select().from(timeSlots).where(eq(timeSlots.tenantId, tenantId)),
    db.select().from(courses).where(eq(courses.tenantId, tenantId)),
    db.select().from(studentGroups).where(eq(studentGroups.tenantId, tenantId)),
    db.select().from(users).where(eq(users.tenantId, tenantId)),
    db.select().from(schedulingConstraints).where(eq(schedulingConstraints.tenantId, tenantId)),
  ]);

  const courseIds = allCourses.map((c) => c.id);
  const userIds = allUsers.map((u) => u.id);
  const [
    allSessions,
    allCourseStudentGroups,
    allDayExceptions,
    allDateExceptions,
  ] = await Promise.all([
    courseIds.length > 0
      ? db.select().from(courseSessions).where(inArray(courseSessions.courseId, courseIds))
      : Promise.resolve([]),
    courseIds.length > 0
      ? db.select().from(courseStudentGroups).where(inArray(courseStudentGroups.courseId, courseIds))
      : Promise.resolve([]),
    userIds.length > 0
      ? db.select().from(lecturerDayExceptions).where(inArray(lecturerDayExceptions.userId, userIds))
      : Promise.resolve([]),
    userIds.length > 0
      ? db.select().from(lecturerDateExceptions).where(inArray(lecturerDateExceptions.userId, userIds))
      : Promise.resolve([]),
  ]);

  const sessionIds = allSessions.map((s) => s.id);
  const allSessionLecturers = sessionIds.length > 0
    ? await db.select().from(sessionLecturers).where(inArray(sessionLecturers.sessionId, sessionIds))
    : [];

  const engineRooms = allRooms.map((r) => ({
    id: r.id,
    name: r.name,
    capacity: r.capacity,
    roomType: r.roomType,
    building: r.building ?? undefined,
    equipment: r.equipment ?? [],
  }));

  const trimTime = (t: string) => t.slice(0, 5);

  const engineTimeSlots = allTimeSlots.map((ts) => ({
    id: ts.id,
    dayOfWeek: ts.dayOfWeek,
    startTime: trimTime(ts.startTime),
    endTime: trimTime(ts.endTime),
    date: ts.date,
  }));

  const slotsByWeek = new Map<number, typeof allTimeSlots>();
  for (const ts of allTimeSlots) {
    const weekNum = getISOWeekNumber(ts.date);
    const existing = slotsByWeek.get(weekNum) ?? [];
    existing.push(ts);
    slotsByWeek.set(weekNum, existing);
  }
  const sortedWeeks = [...slotsByWeek.keys()].sort((a, b) => a - b);

  const engineStudentGroups = allStudentGroups.map((sg) => ({
    id: sg.id,
    name: sg.name,
    size: sg.size,
  }));

  const lecturerUserIds = new Set(allSessionLecturers.map((sl) => sl.userId));
  const lecturerUsers = allUsers.filter((u) => lecturerUserIds.has(u.id));

  const unavailableDaysByUser = new Map<string, Set<string>>();
  for (const exc of allDayExceptions) {
    const existing = unavailableDaysByUser.get(exc.userId) ?? new Set<string>();
    existing.add(exc.dayOfWeek);
    unavailableDaysByUser.set(exc.userId, existing);
  }

  const unavailableDatesByUser = new Map<string, Set<string>>();
  for (const exc of allDateExceptions) {
    const existing = unavailableDatesByUser.get(exc.userId) ?? new Set<string>();
    existing.add(exc.date);
    unavailableDatesByUser.set(exc.userId, existing);
  }

  const engineLecturers = lecturerUsers.map((u) => {
    const unavailableDays = unavailableDaysByUser.get(u.id) ?? new Set<string>();
    const unavailableDates = unavailableDatesByUser.get(u.id) ?? new Set<string>();

    const availableSlots = engineTimeSlots
      .filter((ts) => !unavailableDays.has(ts.dayOfWeek) && !unavailableDates.has(ts.date))
      .map((ts) => ts.id);

    return {
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
      availableTimeSlotIds: availableSlots,
      preferredRoomIds: [],
      preferredTimeSlotIds: [],
      maxConsecutiveSlots: 4,
    };
  });

  const lecturersBySession = new Map<string, string[]>();
  for (const sl of allSessionLecturers) {
    const existing = lecturersBySession.get(sl.sessionId) ?? [];
    existing.push(sl.userId);
    lecturersBySession.set(sl.sessionId, existing);
  }

  const studentGroupsByCourseMap = new Map<string, string[]>();
  for (const csg of allCourseStudentGroups) {
    const existing = studentGroupsByCourseMap.get(csg.courseId) ?? [];
    existing.push(csg.studentGroupId);
    studentGroupsByCourseMap.set(csg.courseId, existing);
  }

  const courseMap = new Map(allCourses.map((c) => [c.id, c]));

  const engineSessions = [];
  for (const [wIdx, weekNum] of sortedWeeks.entries()) {
    const weekSlots = slotsByWeek.get(weekNum)!;
    const weekSlotIds = weekSlots.map((s) => s.id);

    // Map session type to required room type for room pre-filtering
    const sessionTypeToRoomType: Record<string, string> = {
      lecture: 'lecture_hall',
      tutorial: 'tutorial_room',
      lab: 'lab',
    };

    for (const session of allSessions) {
      const course = courseMap.get(session.courseId);
      if (!course) continue;
      const lIds = lecturersBySession.get(session.id) ?? [];
      const sgIds = studentGroupsByCourseMap.get(session.courseId) ?? [];
      if (lIds.length === 0 || sgIds.length === 0) continue;

      for (let f = 0; f < session.frequencyPerWeek; f++) {
        engineSessions.push({
          id: `${session.id}_w${wIdx}_f${f}`,
          courseId: session.courseId,
          courseCode: course.code,
          sessionType: session.sessionType,
          durationSlots: session.durationSlots,
          lecturerIds: lIds,
          studentGroupIds: sgIds,
          requiredRoomType: sessionTypeToRoomType[session.sessionType],
          requiredEquipment: [],
          allowedTimeSlotIds: weekSlotIds,
        });
      }
    }
  }

  const engineConstraints = allConstraints.map((c) => ({
    type: c.constraintType as EngineSolveRequest['constraints'][number]['type'],
    severity: c.severity,
    weight: c.weight,
    config: JSON.parse(c.config) as Record<string, unknown>,
  }));

  const payload: EngineSolveRequest = {
    tenantId,
    scheduleId,
    callbackUrl,
    rooms: engineRooms,
    timeSlots: engineTimeSlots,
    lecturers: engineLecturers,
    studentGroups: engineStudentGroups,
    sessions: engineSessions,
    constraints: engineConstraints,
    solverConfig: { timeoutSeconds: 300, numWorkers: 4 },
  };

  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', env.ENGINE_HMAC_SECRET).update(body).digest('hex');

  const response = await fetch(`${env.ENGINE_URL}/solve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': signature,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Engine returned ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as EngineSolveAcceptedResponse;

  return { jobId: result.jobId };
}
