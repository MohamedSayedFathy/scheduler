import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

import { courses, courseLecturers, courseSessions, sessionLecturers, users } from '@/lib/db/schema';
import { adminProcedure, createTRPCRouter } from '@/lib/trpc/trpc';

const insertCourseSchema = createInsertSchema(courses).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});

const updateCourseSchema = insertCourseSchema.partial();

const insertSessionSchema = createInsertSchema(courseSessions).omit({
  id: true,
  createdAt: true,
});

export const coursesRouter = createTRPCRouter({
  list: adminProcedure.query(async ({ ctx }) => {
    const allCourses = await ctx.db.select().from(courses).where(eq(courses.tenantId, ctx.session!.tenantId));
    const courseIds = allCourses.map((c) => c.id);
    const allSessions =
      courseIds.length > 0
        ? await ctx.db.select().from(courseSessions).where(inArray(courseSessions.courseId, courseIds))
        : [];
    const allSessionLecturers =
      allSessions.length > 0
        ? await ctx.db.select().from(sessionLecturers).where(inArray(sessionLecturers.sessionId, allSessions.map((s) => s.id)))
        : [];

    return allCourses.map((course) => ({
      ...course,
      sessions: allSessions
        .filter((s) => s.courseId === course.id)
        .map((s) => ({
          ...s,
          lecturers: allSessionLecturers.filter((sl) => sl.sessionId === s.id),
        })),
    }));
  }),

  getById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [course] = await ctx.db
        .select()
        .from(courses)
        .where(and(eq(courses.id, input.id), eq(courses.tenantId, ctx.session!.tenantId)));

      if (!course) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
      }

      const [sessions, lecturers] = await Promise.all([
        ctx.db
          .select()
          .from(courseSessions)
          .where(eq(courseSessions.courseId, input.id)),
        ctx.db
          .select()
          .from(courseLecturers)
          .where(eq(courseLecturers.courseId, input.id)),
      ]);

      const courseSessionIds = sessions.map((s) => s.id);
      const allSessionLecturers =
        courseSessionIds.length > 0
          ? await ctx.db
              .select()
              .from(sessionLecturers)
              .where(inArray(sessionLecturers.sessionId, courseSessionIds))
          : [];

      const sessionsWithLecturers = sessions.map((s) => ({
        ...s,
        lecturers: allSessionLecturers.filter((sl) => sl.sessionId === s.id),
      }));

      return { ...course, sessions: sessionsWithLecturers, lecturers };
    }),

  listLecturers: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(and(eq(users.role, 'lecturer'), eq(users.tenantId, ctx.session!.tenantId)));
  }),

  create: adminProcedure
    .input(insertCourseSchema)
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(courses)
        .values({
          ...input,
          tenantId: ctx.session!.tenantId,
        })
        .returning();

      return created;
    }),

  update: adminProcedure
    .input(z.object({ id: z.string().uuid(), data: updateCourseSchema }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(courses)
        .set({ ...input.data, updatedAt: new Date() })
        .where(and(eq(courses.id, input.id), eq(courses.tenantId, ctx.session!.tenantId)))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
      }

      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(courses)
        .where(and(eq(courses.id, input.id), eq(courses.tenantId, ctx.session!.tenantId)))
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
      }

      return deleted;
    }),

  addSession: adminProcedure
    .input(
      insertSessionSchema.pick({
        courseId: true,
        sessionType: true,
        durationSlots: true,
        frequencyPerWeek: true,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [course] = await ctx.db
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.id, input.courseId), eq(courses.tenantId, ctx.session!.tenantId)));
      if (!course) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
      }

      const [created] = await ctx.db
        .insert(courseSessions)
        .values(input)
        .returning();

      return created;
    }),

  removeSession: adminProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select({ id: courseSessions.id })
        .from(courseSessions)
        .innerJoin(courses, eq(courseSessions.courseId, courses.id))
        .where(and(eq(courseSessions.id, input.sessionId), eq(courses.tenantId, ctx.session!.tenantId)));
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      const [deleted] = await ctx.db
        .delete(courseSessions)
        .where(eq(courseSessions.id, input.sessionId))
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      return deleted;
    }),

  addLecturer: adminProcedure
    .input(z.object({ courseId: z.string().uuid(), userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [course] = await ctx.db
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.id, input.courseId), eq(courses.tenantId, ctx.session!.tenantId)));
      if (!course) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
      }

      const [created] = await ctx.db
        .insert(courseLecturers)
        .values(input)
        .returning();

      return created;
    }),

  removeLecturer: adminProcedure
    .input(z.object({ courseId: z.string().uuid(), userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [course] = await ctx.db
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.id, input.courseId), eq(courses.tenantId, ctx.session!.tenantId)));
      if (!course) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
      }

      const [deleted] = await ctx.db
        .delete(courseLecturers)
        .where(
          and(
            eq(courseLecturers.courseId, input.courseId),
            eq(courseLecturers.userId, input.userId),
          ),
        )
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lecturer assignment not found' });
      }

      return deleted;
    }),

  addSessionLecturer: adminProcedure
    .input(z.object({ sessionId: z.string().uuid(), userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select({ id: courseSessions.id })
        .from(courseSessions)
        .innerJoin(courses, eq(courseSessions.courseId, courses.id))
        .where(and(eq(courseSessions.id, input.sessionId), eq(courses.tenantId, ctx.session!.tenantId)));
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      const [created] = await ctx.db
        .insert(sessionLecturers)
        .values(input)
        .returning();

      return created;
    }),

  removeSessionLecturer: adminProcedure
    .input(z.object({ sessionId: z.string().uuid(), userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [session] = await ctx.db
        .select({ id: courseSessions.id })
        .from(courseSessions)
        .innerJoin(courses, eq(courseSessions.courseId, courses.id))
        .where(and(eq(courseSessions.id, input.sessionId), eq(courses.tenantId, ctx.session!.tenantId)));
      if (!session) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
      }

      const [deleted] = await ctx.db
        .delete(sessionLecturers)
        .where(
          and(
            eq(sessionLecturers.sessionId, input.sessionId),
            eq(sessionLecturers.userId, input.userId),
          ),
        )
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Session lecturer not found' });
      }

      return deleted;
    }),
});
