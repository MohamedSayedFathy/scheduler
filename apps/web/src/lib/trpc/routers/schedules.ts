import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { env } from '@/env';
import {
  courseStudentGroups,
  courseSessions,
  generatedSchedules,
  rooms,
  scheduleEntries,
  sessionLecturers,
  timeSlots,
  users,
} from '@/lib/db/schema';
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
              })
              .from(courseStudentGroups)
              .where(inArray(courseStudentGroups.courseId, courseIds))
          : [];

      return { ...schedule, entries, lecturersBySession, studentGroupsByCourse };
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
});
