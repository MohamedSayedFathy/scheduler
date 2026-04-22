import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { env } from '@/env';
import {
  courseStudentGroups,
  courseSessions,
  generatedSchedules,
  lecturerDateExceptions,
  lecturerDayExceptions,
  rooms,
  scheduleEntries,
  scheduleEvents,
  scheduleVersions,
  sessionLecturers,
  studentGroups,
  timeSlots,
  users,
} from '@/lib/db/schema';
import { detectConflicts } from '@/lib/schedules/conflicts';
import { triggerSolve } from '@/lib/services/engine';
import { adminProcedure, createTRPCRouter } from '@/lib/trpc/trpc';

export const schedulesRouter = createTRPCRouter({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(generatedSchedules)
      .where(eq(generatedSchedules.tenantId, ctx.session!.tenantId))
      .orderBy(desc(generatedSchedules.createdAt));
  }),

  getById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [schedule] = await ctx.db
        .select()
        .from(generatedSchedules)
        .where(and(eq(generatedSchedules.id, input.id), eq(generatedSchedules.tenantId, ctx.session!.tenantId)));

      if (!schedule) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule not found' });
      }

      const entries = await ctx.db
        .select({
          entry: scheduleEntries,
          session: courseSessions,
          room: rooms,
          timeSlot: timeSlots,
          assignedLecturerId: scheduleEntries.assignedLecturerId,
        })
        .from(scheduleEntries)
        .innerJoin(courseSessions, eq(scheduleEntries.sessionId, courseSessions.id))
        .innerJoin(rooms, eq(scheduleEntries.roomId, rooms.id))
        .innerJoin(timeSlots, eq(scheduleEntries.timeSlotId, timeSlots.id))
        .where(eq(scheduleEntries.scheduleId, input.id));

      const sessionIds = [...new Set(entries.map((e) => e.session.id))];
      const courseIds = [...new Set(entries.map((e) => e.session.courseId))];

      const lecturersBySession =
        sessionIds.length > 0
          ? await ctx.db
              .select({
                sessionId: sessionLecturers.sessionId,
                lecturerId: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
              })
              .from(sessionLecturers)
              .innerJoin(users, eq(sessionLecturers.userId, users.id))
              .where(inArray(sessionLecturers.sessionId, sessionIds))
          : [];

      const studentGroupsByCourse =
        courseIds.length > 0
          ? await ctx.db
              .select({
                courseId: courseStudentGroups.courseId,
                studentGroupId: courseStudentGroups.studentGroupId,
                color: studentGroups.color,
              })
              .from(courseStudentGroups)
              .innerJoin(studentGroups, eq(courseStudentGroups.studentGroupId, studentGroups.id))
              .where(inArray(courseStudentGroups.courseId, courseIds))
          : [];

      // Build a map from courseId → first attending group's color
      const groupColorByCourse = new Map<string, string>();
      for (const row of studentGroupsByCourse) {
        if (!groupColorByCourse.has(row.courseId) && row.color) {
          groupColorByCourse.set(row.courseId, row.color);
        }
      }

      // Build userId → full name from the lecturersBySession rows
      const userNameById = new Map<string, string>();
      for (const row of lecturersBySession) {
        if (!userNameById.has(row.lecturerId)) {
          const name = [row.firstName, row.lastName].filter(Boolean).join(' ');
          if (name) userNameById.set(row.lecturerId, name);
        }
      }

      // Annotate each entry with groupColor and assignedLecturerName
      const entriesWithColor = entries.map((e) => ({
        ...e,
        groupColor: groupColorByCourse.get(e.session.courseId) ?? null,
        assignedLecturerName: e.assignedLecturerId
          ? (userNameById.get(e.assignedLecturerId) ?? null)
          : null,
      }));

      const eventRows = await ctx.db
        .select({
          id: scheduleEvents.id,
          title: scheduleEvents.title,
          date: scheduleEvents.date,
          startTime: scheduleEvents.startTime,
          endTime: scheduleEvents.endTime,
          roomId: scheduleEvents.roomId,
          roomName: rooms.name,
        })
        .from(scheduleEvents)
        .leftJoin(rooms, eq(scheduleEvents.roomId, rooms.id))
        .where(eq(scheduleEvents.scheduleId, input.id));

      const events = eventRows.map((r) => ({
        id: r.id,
        title: r.title,
        date: r.date,
        startTime: r.startTime,
        endTime: r.endTime,
        roomId: r.roomId,
        roomName: r.roomName ?? null,
      }));

      return { ...schedule, entries: entriesWithColor, lecturersBySession, studentGroupsByCourse, events };
    }),

  generate: adminProcedure
    .input(z.object({ name: z.string().min(1).max(255).optional() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session!.tenantId;

      const [schedule] = await ctx.db
        .insert(generatedSchedules)
        .values({
          tenantId,
          name: input.name ?? `Schedule ${new Date().toISOString()}`,
          status: 'pending',
        })
        .returning();

      if (!schedule) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create schedule' });
      }

      const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/engine`;

      const { jobId } = await triggerSolve(ctx.db, schedule.id, tenantId, callbackUrl);

      return { scheduleId: schedule.id, jobId };
    }),

  updateEntry: adminProcedure
    .input(
      z.object({
        entryId: z.string().uuid(),
        roomId: z.string().uuid().optional(),
        timeSlotId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { entryId, ...updates } = input;

      const setData: Record<string, string> = {};
      if (updates.roomId) setData.roomId = updates.roomId;
      if (updates.timeSlotId) setData.timeSlotId = updates.timeSlotId;

      if (Object.keys(setData).length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'At least one of roomId or timeSlotId must be provided',
        });
      }

      const [entry] = await ctx.db
        .select({ id: scheduleEntries.id })
        .from(scheduleEntries)
        .innerJoin(generatedSchedules, eq(scheduleEntries.scheduleId, generatedSchedules.id))
        .where(and(eq(scheduleEntries.id, entryId), eq(generatedSchedules.tenantId, ctx.session!.tenantId)));
      if (!entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule entry not found' });
      }

      const [updated] = await ctx.db
        .update(scheduleEntries)
        .set(setData)
        .where(eq(scheduleEntries.id, entryId))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule entry not found' });
      }

      return updated;
    }),

  moveEntry: adminProcedure
    .input(
      z.object({
        scheduleId: z.string().uuid(),
        sessionId: z.string().uuid(),
        currentTimeSlotId: z.string().uuid().optional(),
        newRoomId: z.string().uuid().optional(),
        newStartTimeSlotId: z.string().uuid().optional(),
        scope: z.enum(['this', 'future', 'past', 'all']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { scheduleId, sessionId, currentTimeSlotId, newRoomId, newStartTimeSlotId, scope } = input;
      const tenantId = ctx.session!.tenantId;

      // Tenant-scope: verify schedule belongs to this tenant
      const [schedule] = await ctx.db
        .select({ id: generatedSchedules.id })
        .from(generatedSchedules)
        .where(and(eq(generatedSchedules.id, scheduleId), eq(generatedSchedules.tenantId, tenantId)));
      if (!schedule) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule not found' });
      }

      // Load the session to determine durationSlots
      const [session] = await ctx.db
        .select({ durationSlots: courseSessions.durationSlots })
        .from(courseSessions)
        .where(eq(courseSessions.id, sessionId));
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      const durationSlots = session.durationSlots;

      // Load all current entries for this session in this schedule, ordered by timeSlot date+startTime
      const currentEntries = await ctx.db
        .select({
          entryId: scheduleEntries.id,
          timeSlotId: scheduleEntries.timeSlotId,
          roomId: scheduleEntries.roomId,
          assignedLecturerId: scheduleEntries.assignedLecturerId,
          date: timeSlots.date,
          dayOfWeek: timeSlots.dayOfWeek,
          startTime: timeSlots.startTime,
        })
        .from(scheduleEntries)
        .innerJoin(timeSlots, eq(scheduleEntries.timeSlotId, timeSlots.id))
        .where(
          and(eq(scheduleEntries.scheduleId, scheduleId), eq(scheduleEntries.sessionId, sessionId)),
        )
        .orderBy(asc(timeSlots.date), asc(timeSlots.startTime));

      if (currentEntries.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No entries found for this session' });
      }

      // Determine which weeks to update
      // All entries share the same sessionId across all 17 weeks (Option A confirmed)
      // Group entries by week: derive week key from date
      const weekGroups = new Map<string, typeof currentEntries>();
      for (const entry of currentEntries) {
        const weekKey = getISOWeekKey(entry.date);
        const group = weekGroups.get(weekKey) ?? [];
        group.push(entry);
        weekGroups.set(weekKey, group);
      }

      const anchorEntry = currentTimeSlotId
        ? currentEntries.find((e) => e.timeSlotId === currentTimeSlotId)
        : currentEntries[0];
      if (!anchorEntry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Source entry not found for this session' });
      }
      const anchorDate = anchorEntry.date;

      const minDateByWeek = new Map<string, string>();
      for (const [weekKey, entries] of weekGroups.entries()) {
        const min = entries.reduce((acc, e) => (e.date < acc ? e.date : acc), entries[0]!.date);
        minDateByWeek.set(weekKey, min);
      }

      let targetWeekKeys: string[];
      switch (scope) {
        case 'this':
          targetWeekKeys = [getISOWeekKey(anchorDate)];
          break;
        case 'future':
          targetWeekKeys = [...weekGroups.keys()].filter(
            (k) => (minDateByWeek.get(k) ?? '') >= anchorDate,
          );
          break;
        case 'past':
          targetWeekKeys = [...weekGroups.keys()].filter(
            (k) => (minDateByWeek.get(k) ?? '') <= anchorDate,
          );
          break;
        case 'all':
          targetWeekKeys = [...weekGroups.keys()];
          break;
      }

      // If newStartTimeSlotId is provided, we need to find the N consecutive slots
      // for each target week by matching (dayOfWeek, startTime) of the new start slot
      let newSlotTemplate: { dayOfWeek: string; startTime: string } | null = null;
      if (newStartTimeSlotId) {
        const [newStartSlot] = await ctx.db
          .select({ dayOfWeek: timeSlots.dayOfWeek, startTime: timeSlots.startTime })
          .from(timeSlots)
          .where(
            and(eq(timeSlots.id, newStartTimeSlotId), eq(timeSlots.tenantId, tenantId)),
          );
        if (!newStartSlot) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Target time slot not found' });
        }
        newSlotTemplate = newStartSlot;
      }

      // For each target week, compute new timeSlotIds
      // We need all slots in those weeks with matching (dayOfWeek) to find consecutive slots
      await ctx.db.transaction(async (tx) => {
        for (const weekKey of targetWeekKeys) {
          const weekEntries = weekGroups.get(weekKey);
          if (!weekEntries || weekEntries.length === 0) continue;

          // Delete all current entries for this session in this week's scope
          const weekEntryIds = weekEntries.map((e) => e.entryId);
          await tx.delete(scheduleEntries).where(inArray(scheduleEntries.id, weekEntryIds));

          // Compute new slot IDs for this week
          let newTimeSlotIds: string[];

          if (newSlotTemplate) {
            // Find all slots in this week matching dayOfWeek, ordered by startTime
            // to find N consecutive ones starting at the given startTime
            const weekDates = weekEntries.map((e) => e.date);
            const weekDateSet = new Set(weekDates);

            // Get all time slots for this tenant on the same day of week that fall in this week
            const candidateSlots = await tx
              .select({ id: timeSlots.id, startTime: timeSlots.startTime, date: timeSlots.date })
              .from(timeSlots)
              .where(
                and(
                  eq(timeSlots.tenantId, tenantId),
                  sql`${timeSlots.dayOfWeek} = ${newSlotTemplate.dayOfWeek}`,
                ),
              )
              .orderBy(asc(timeSlots.date), asc(timeSlots.startTime));

            // Filter to slots in this specific week
            const weekSlots = candidateSlots.filter((s) => {
              const slotWeekKey = getISOWeekKey(s.date);
              return slotWeekKey === weekKey || weekDateSet.has(s.date);
            });

            // Find the start index matching the startTime
            const startIdx = weekSlots.findIndex((s) => s.startTime === newSlotTemplate!.startTime);
            if (startIdx === -1 || startIdx + durationSlots > weekSlots.length) {
              // Not enough consecutive slots — skip this week silently
              continue;
            }

            newTimeSlotIds = weekSlots.slice(startIdx, startIdx + durationSlots).map((s) => s.id);
          } else {
            // Keep existing time slots (only room is changing)
            newTimeSlotIds = weekEntries.map((e) => e.timeSlotId);
          }

          // Determine new roomId and preserve assigned lecturer
          const resolvedRoomId = newRoomId ?? (weekEntries[0]?.roomId ?? '');
          const resolvedAssignedLecturerId = weekEntries[0]?.assignedLecturerId ?? null;

          // Insert new entries
          const newRows = newTimeSlotIds.map((tsId) => ({
            scheduleId,
            sessionId,
            roomId: resolvedRoomId,
            timeSlotId: tsId,
            assignedLecturerId: resolvedAssignedLecturerId,
          }));

          if (newRows.length > 0) {
            await tx.insert(scheduleEntries).values(newRows);
          }
        }
      });

      return { success: true };
    }),

  deleteEntry: adminProcedure
    .input(
      z.object({
        scheduleId: z.string().uuid(),
        sessionId: z.string().uuid(),
        currentTimeSlotId: z.string().uuid().optional(),
        scope: z.enum(['this', 'future', 'past', 'all']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { scheduleId, sessionId, currentTimeSlotId, scope } = input;
      const tenantId = ctx.session!.tenantId;

      const [schedule] = await ctx.db
        .select({ id: generatedSchedules.id })
        .from(generatedSchedules)
        .where(and(eq(generatedSchedules.id, scheduleId), eq(generatedSchedules.tenantId, tenantId)));
      if (!schedule) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule not found' });
      }

      const currentEntries = await ctx.db
        .select({
          entryId: scheduleEntries.id,
          timeSlotId: scheduleEntries.timeSlotId,
          date: timeSlots.date,
        })
        .from(scheduleEntries)
        .innerJoin(timeSlots, eq(scheduleEntries.timeSlotId, timeSlots.id))
        .where(
          and(eq(scheduleEntries.scheduleId, scheduleId), eq(scheduleEntries.sessionId, sessionId)),
        )
        .orderBy(asc(timeSlots.date), asc(timeSlots.startTime));

      if (currentEntries.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No entries found for this session' });
      }

      const weekGroups = new Map<string, typeof currentEntries>();
      for (const entry of currentEntries) {
        const weekKey = getISOWeekKey(entry.date);
        const group = weekGroups.get(weekKey) ?? [];
        group.push(entry);
        weekGroups.set(weekKey, group);
      }

      const anchorEntry = currentTimeSlotId
        ? currentEntries.find((e) => e.timeSlotId === currentTimeSlotId)
        : currentEntries[0];
      if (!anchorEntry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Source entry not found for this session' });
      }
      const anchorDate = anchorEntry.date;

      const minDateByWeek = new Map<string, string>();
      for (const [weekKey, entries] of weekGroups.entries()) {
        const min = entries.reduce((acc, e) => (e.date < acc ? e.date : acc), entries[0]!.date);
        minDateByWeek.set(weekKey, min);
      }

      let targetWeekKeys: string[];
      switch (scope) {
        case 'this':
          targetWeekKeys = [getISOWeekKey(anchorDate)];
          break;
        case 'future':
          targetWeekKeys = [...weekGroups.keys()].filter(
            (k) => (minDateByWeek.get(k) ?? '') >= anchorDate,
          );
          break;
        case 'past':
          targetWeekKeys = [...weekGroups.keys()].filter(
            (k) => (minDateByWeek.get(k) ?? '') <= anchorDate,
          );
          break;
        case 'all':
          targetWeekKeys = [...weekGroups.keys()];
          break;
      }

      const entryIdsToDelete = targetWeekKeys.flatMap(
        (k) => (weekGroups.get(k) ?? []).map((e) => e.entryId),
      );

      if (entryIdsToDelete.length > 0) {
        await ctx.db.transaction(async (tx) => {
          await tx.delete(scheduleEntries).where(inArray(scheduleEntries.id, entryIdsToDelete));
        });
      }

      return { success: true, deletedCount: entryIdsToDelete.length };
    }),

  createEvent: adminProcedure
    .input(
      z.object({
        scheduleId: z.string().uuid(),
        title: z.string().min(1).max(255),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        roomId: z.string().uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [schedule] = await ctx.db
        .select({ id: generatedSchedules.id })
        .from(generatedSchedules)
        .where(
          and(
            eq(generatedSchedules.id, input.scheduleId),
            eq(generatedSchedules.tenantId, ctx.session!.tenantId),
          ),
        );
      if (!schedule) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule not found' });
      }

      if (input.endTime <= input.startTime) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'End time must be after start time' });
      }

      const [row] = await ctx.db
        .insert(scheduleEvents)
        .values({
          scheduleId: input.scheduleId,
          title: input.title,
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          roomId: input.roomId,
        })
        .returning({ id: scheduleEvents.id });

      return { eventId: row!.id };
    }),

  deleteEvent: adminProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ id: scheduleEvents.id })
        .from(scheduleEvents)
        .innerJoin(generatedSchedules, eq(scheduleEvents.scheduleId, generatedSchedules.id))
        .where(
          and(
            eq(scheduleEvents.id, input.eventId),
            eq(generatedSchedules.tenantId, ctx.session!.tenantId),
          ),
        );
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      await ctx.db.delete(scheduleEvents).where(eq(scheduleEvents.id, input.eventId));
      return { success: true };
    }),

  createEmpty: adminProcedure
    .input(z.object({ name: z.string().min(1).max(255).optional() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(generatedSchedules)
        .values({
          tenantId: ctx.session!.tenantId,
          name: input.name ?? null,
          status: 'solved',
          generatedAt: new Date(),
        })
        .returning({ id: generatedSchedules.id });
      if (!row) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create schedule' });
      }
      return { scheduleId: row.id };
    }),

  createEntry: adminProcedure
    .input(
      z.object({
        scheduleId: z.string().uuid(),
        sessionId: z.string().uuid(),
        startTimeSlotId: z.string().uuid(),
        roomId: z.string().uuid(),
        assignedLecturerId: z.string().uuid().nullable(),
        scope: z.enum(['this', 'future', 'past', 'all']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { scheduleId, sessionId, startTimeSlotId, roomId, assignedLecturerId, scope } = input;
      const tenantId = ctx.session!.tenantId;

      const [schedule] = await ctx.db
        .select({ id: generatedSchedules.id })
        .from(generatedSchedules)
        .where(and(eq(generatedSchedules.id, scheduleId), eq(generatedSchedules.tenantId, tenantId)));
      if (!schedule) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule not found' });
      }

      const [session] = await ctx.db
        .select({ durationSlots: courseSessions.durationSlots })
        .from(courseSessions)
        .where(eq(courseSessions.id, sessionId));
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }
      const durationSlots = session.durationSlots;

      const [anchorSlot] = await ctx.db
        .select({
          dayOfWeek: timeSlots.dayOfWeek,
          startTime: timeSlots.startTime,
          date: timeSlots.date,
        })
        .from(timeSlots)
        .where(and(eq(timeSlots.id, startTimeSlotId), eq(timeSlots.tenantId, tenantId)));
      if (!anchorSlot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Start time slot not found' });
      }

      const allTenantSlots = await ctx.db
        .select({ id: timeSlots.id, dayOfWeek: timeSlots.dayOfWeek, startTime: timeSlots.startTime, date: timeSlots.date })
        .from(timeSlots)
        .where(eq(timeSlots.tenantId, tenantId))
        .orderBy(asc(timeSlots.date), asc(timeSlots.startTime));

      // Group all slots by ISO week
      const allWeekGroups = new Map<string, typeof allTenantSlots>();
      for (const slot of allTenantSlots) {
        const wk = getISOWeekKey(slot.date);
        const group = allWeekGroups.get(wk) ?? [];
        group.push(slot);
        allWeekGroups.set(wk, group);
      }

      const anchorWeekKey = getISOWeekKey(anchorSlot.date);
      const anchorDate = anchorSlot.date;

      // minDate per week (first date in that week)
      const minDateByWeek = new Map<string, string>();
      for (const [wk, slots] of allWeekGroups.entries()) {
        const min = slots.reduce((acc, s) => (s.date < acc ? s.date : acc), slots[0]!.date);
        minDateByWeek.set(wk, min);
      }

      let targetWeekKeys: string[];
      switch (scope) {
        case 'this':
          targetWeekKeys = [anchorWeekKey];
          break;
        case 'future':
          targetWeekKeys = [...allWeekGroups.keys()].filter(
            (k) => (minDateByWeek.get(k) ?? '') >= anchorDate,
          );
          break;
        case 'past':
          targetWeekKeys = [...allWeekGroups.keys()].filter(
            (k) => (minDateByWeek.get(k) ?? '') <= anchorDate,
          );
          break;
        case 'all':
          targetWeekKeys = [...allWeekGroups.keys()];
          break;
      }

      let insertedCount = 0;
      const skippedWeeks: string[] = [];

      await ctx.db.transaction(async (tx) => {
        for (const weekKey of targetWeekKeys) {
          const weekSlots = (allWeekGroups.get(weekKey) ?? []).filter(
            (s) => s.dayOfWeek === anchorSlot.dayOfWeek,
          );
          weekSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

          const startIdx = weekSlots.findIndex((s) => s.startTime === anchorSlot.startTime);
          if (startIdx === -1 || startIdx + durationSlots > weekSlots.length) {
            skippedWeeks.push(weekKey);
            continue;
          }

          const slotIds = weekSlots.slice(startIdx, startIdx + durationSlots).map((s) => s.id);
          await tx.insert(scheduleEntries).values(
            slotIds.map((tsId) => ({
              scheduleId,
              sessionId,
              roomId,
              timeSlotId: tsId,
              assignedLecturerId,
            })),
          );
          insertedCount += slotIds.length;
        }
      });

      return { insertedCount, skippedWeeks };
    }),

  saveVersion: adminProcedure
    .input(z.object({ scheduleId: z.string().uuid(), name: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      const { scheduleId, name } = input;
      const tenantId = ctx.session!.tenantId;

      // Tenant-check
      const [schedule] = await ctx.db
        .select({ id: generatedSchedules.id })
        .from(generatedSchedules)
        .where(and(eq(generatedSchedules.id, scheduleId), eq(generatedSchedules.tenantId, tenantId)));
      if (!schedule) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule not found' });
      }

      // Load current entries
      const entries = await ctx.db
        .select({
          id: scheduleEntries.id,
          sessionId: scheduleEntries.sessionId,
          roomId: scheduleEntries.roomId,
          timeSlotId: scheduleEntries.timeSlotId,
          assignedLecturerId: scheduleEntries.assignedLecturerId,
        })
        .from(scheduleEntries)
        .where(eq(scheduleEntries.scheduleId, scheduleId));

      // Build supporting data for conflict detection
      const sessionIds = [...new Set(entries.map((e) => e.sessionId))];
      const courseIds: string[] = [];

      const sessionRows =
        sessionIds.length > 0
          ? await ctx.db
              .select({
                id: courseSessions.id,
                courseId: courseSessions.courseId,
                sessionType: courseSessions.sessionType,
                durationSlots: courseSessions.durationSlots,
              })
              .from(courseSessions)
              .where(inArray(courseSessions.id, sessionIds))
          : [];

      for (const s of sessionRows) {
        if (!courseIds.includes(s.courseId)) courseIds.push(s.courseId);
      }

      const [allRooms, allTimeSlots, allStudentGroups] = await Promise.all([
        ctx.db.select().from(rooms).where(eq(rooms.tenantId, tenantId)),
        ctx.db.select().from(timeSlots).where(eq(timeSlots.tenantId, tenantId)),
        ctx.db.select().from(studentGroups).where(eq(studentGroups.tenantId, tenantId)),
      ]);

      const slLecturers =
        sessionIds.length > 0
          ? await ctx.db
              .select({ sessionId: sessionLecturers.sessionId, userId: sessionLecturers.userId })
              .from(sessionLecturers)
              .where(inArray(sessionLecturers.sessionId, sessionIds))
          : [];

      const csgRows =
        courseIds.length > 0
          ? await ctx.db
              .select({
                courseId: courseStudentGroups.courseId,
                studentGroupId: courseStudentGroups.studentGroupId,
              })
              .from(courseStudentGroups)
              .where(inArray(courseStudentGroups.courseId, courseIds))
          : [];

      // Build lecturer availability using same logic as engine.ts
      const lecturerUserIds = [...new Set(slLecturers.map((sl) => sl.userId))];
      const [dayExceptions, dateExceptions] = await Promise.all([
        lecturerUserIds.length > 0
          ? ctx.db
              .select({ userId: lecturerDayExceptions.userId, dayOfWeek: lecturerDayExceptions.dayOfWeek })
              .from(lecturerDayExceptions)
              .where(inArray(lecturerDayExceptions.userId, lecturerUserIds))
          : Promise.resolve([]),
        lecturerUserIds.length > 0
          ? ctx.db
              .select({ userId: lecturerDateExceptions.userId, date: lecturerDateExceptions.date })
              .from(lecturerDateExceptions)
              .where(inArray(lecturerDateExceptions.userId, lecturerUserIds))
          : Promise.resolve([]),
      ]);

      const unavailDays = new Map<string, Set<string>>();
      for (const exc of dayExceptions) {
        const s = unavailDays.get(exc.userId) ?? new Set<string>();
        s.add(exc.dayOfWeek);
        unavailDays.set(exc.userId, s);
      }
      const unavailDates = new Map<string, Set<string>>();
      for (const exc of dateExceptions) {
        const s = unavailDates.get(exc.userId) ?? new Set<string>();
        s.add(exc.date);
        unavailDates.set(exc.userId, s);
      }

      const lecturerAvailability = new Map<string, Set<string>>();
      for (const userId of lecturerUserIds) {
        const ud = unavailDays.get(userId) ?? new Set<string>();
        const udate = unavailDates.get(userId) ?? new Set<string>();
        const available = new Set(
          allTimeSlots
            .filter((ts) => !ud.has(ts.dayOfWeek) && !udate.has(ts.date))
            .map((ts) => ts.id),
        );
        lecturerAvailability.set(userId, available);
      }

      // Build session list for conflict detection
      const lecturersBySession = new Map<string, string[]>();
      for (const sl of slLecturers) {
        const existing = lecturersBySession.get(sl.sessionId) ?? [];
        existing.push(sl.userId);
        lecturersBySession.set(sl.sessionId, existing);
      }

      const sgByCourse = new Map<string, string[]>();
      for (const csg of csgRows) {
        const existing = sgByCourse.get(csg.courseId) ?? [];
        existing.push(csg.studentGroupId);
        sgByCourse.set(csg.courseId, existing);
      }

      const sessionTypeToRoomType: Record<string, string> = {
        lecture: 'lecture_hall',
        tutorial: 'tutorial_room',
        lab: 'lab',
      };

      const conflictSessions = sessionRows.map((s) => ({
        id: s.id,
        sessionType: s.sessionType,
        requiredRoomType: sessionTypeToRoomType[s.sessionType],
        durationSlots: s.durationSlots,
        lecturerIds: lecturersBySession.get(s.id) ?? [],
        studentGroupIds: sgByCourse.get(s.courseId) ?? [],
      }));

      const conflicts = detectConflicts({
        entries,
        sessions: conflictSessions,
        rooms: allRooms.map((r) => ({ id: r.id, capacity: r.capacity, roomType: r.roomType })),
        timeSlots: allTimeSlots.map((ts) => ({
          id: ts.id,
          dayOfWeek: ts.dayOfWeek,
          startTime: ts.startTime,
          endTime: ts.endTime,
          date: ts.date,
        })),
        studentGroups: allStudentGroups.map((sg) => ({ id: sg.id, size: sg.size })),
        lecturerAvailability,
      });

      const snapshot = entries.map((e) => ({
        sessionId: e.sessionId,
        roomId: e.roomId,
        timeSlotId: e.timeSlotId,
        assignedLecturerId: e.assignedLecturerId ?? null,
      }));

      const [version] = await ctx.db
        .insert(scheduleVersions)
        .values({
          scheduleId,
          tenantId,
          name,
          entriesSnapshot: JSON.stringify(snapshot),
          conflictCount: conflicts.length,
          createdBy: ctx.session!.userId,
        })
        .returning();

      if (!version) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to save version' });
      }

      return {
        id: version.id,
        name: version.name,
        conflictCount: version.conflictCount,
        createdAt: version.createdAt,
        createdBy: version.createdBy,
      };
    }),

  listVersions: adminProcedure
    .input(z.object({ scheduleId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.session!.tenantId;

      // Tenant-scope via direct tenantId column
      return ctx.db
        .select({
          id: scheduleVersions.id,
          name: scheduleVersions.name,
          conflictCount: scheduleVersions.conflictCount,
          createdAt: scheduleVersions.createdAt,
          createdBy: scheduleVersions.createdBy,
        })
        .from(scheduleVersions)
        .where(
          and(
            eq(scheduleVersions.scheduleId, input.scheduleId),
            eq(scheduleVersions.tenantId, tenantId),
          ),
        )
        .orderBy(desc(scheduleVersions.createdAt));
    }),

  restoreVersion: adminProcedure
    .input(z.object({ versionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session!.tenantId;

      // Tenant-check via join
      const [version] = await ctx.db
        .select({
          id: scheduleVersions.id,
          scheduleId: scheduleVersions.scheduleId,
          entriesSnapshot: scheduleVersions.entriesSnapshot,
        })
        .from(scheduleVersions)
        .where(and(eq(scheduleVersions.id, input.versionId), eq(scheduleVersions.tenantId, tenantId)));

      if (!version) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Version not found' });
      }

      type SnapshotEntry = { sessionId: string; roomId: string; timeSlotId: string; assignedLecturerId?: string | null };
      let snapshot: SnapshotEntry[];
      try {
        snapshot = JSON.parse(version.entriesSnapshot) as SnapshotEntry[];
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Corrupt version snapshot' });
      }

      await ctx.db.transaction(async (tx) => {
        // Delete all current entries for this schedule
        await tx.delete(scheduleEntries).where(eq(scheduleEntries.scheduleId, version.scheduleId));

        // Bulk-insert from snapshot
        if (snapshot.length > 0) {
          const BATCH_SIZE = 500;
          for (let i = 0; i < snapshot.length; i += BATCH_SIZE) {
            await tx.insert(scheduleEntries).values(
              snapshot.slice(i, i + BATCH_SIZE).map((e) => ({
                scheduleId: version.scheduleId,
                sessionId: e.sessionId,
                roomId: e.roomId,
                timeSlotId: e.timeSlotId,
                assignedLecturerId: e.assignedLecturerId ?? null,
              })),
            );
          }
        }
      });

      return { scheduleId: version.scheduleId };
    }),
});

function getISOWeekKey(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  const temp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  temp.setUTCDate(temp.getUTCDate() + 4 - (temp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((temp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${temp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
