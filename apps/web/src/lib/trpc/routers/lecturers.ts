import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

import {
  courses,
  courseSessions,
  lecturerDateExceptions,
  lecturerDayExceptions,
  sessionLecturers,
  users,
} from '@/lib/db/schema';
import { adminProcedure, createTRPCRouter } from '@/lib/trpc/trpc';

const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  tenantId: true,
  clerkUserId: true,
  role: true,
  createdAt: true,
  updatedAt: true,
});

const updateLecturerSchema = insertUserSchema
  .pick({ email: true, firstName: true, lastName: true })
  .partial();

export const lecturersRouter = createTRPCRouter({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        and(
          eq(users.role, 'lecturer'),
          eq(users.tenantId, ctx.session!.tenantId),
        ),
      );
  }),

  getById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [lecturer] = await ctx.db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(
          and(
            eq(users.id, input.id),
            eq(users.tenantId, ctx.session!.tenantId),
            eq(users.role, 'lecturer'),
          ),
        );

      if (!lecturer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lecturer not found' });
      }

      const [dateExceptions, dayExceptions, sessionAssignments] = await Promise.all([
        ctx.db
          .select()
          .from(lecturerDateExceptions)
          .where(eq(lecturerDateExceptions.userId, input.id)),
        ctx.db
          .select()
          .from(lecturerDayExceptions)
          .where(eq(lecturerDayExceptions.userId, input.id)),
        ctx.db
          .select({
            sessionLecturerId: sessionLecturers.id,
            sessionId: sessionLecturers.sessionId,
            sessionType: courseSessions.sessionType,
            durationSlots: courseSessions.durationSlots,
            frequencyPerWeek: courseSessions.frequencyPerWeek,
            courseId: courses.id,
            courseCode: courses.code,
            courseName: courses.name,
          })
          .from(sessionLecturers)
          .innerJoin(courseSessions, eq(sessionLecturers.sessionId, courseSessions.id))
          .innerJoin(courses, eq(courseSessions.courseId, courses.id))
          .where(
            and(
              eq(sessionLecturers.userId, input.id),
              eq(courses.tenantId, ctx.session!.tenantId),
            ),
          ),
      ]);

      return { ...lecturer, dateExceptions, dayExceptions, sessionAssignments };
    }),

  create: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        firstName: z.string().min(1).max(255).optional(),
        lastName: z.string().min(1).max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(users)
        .values({
          ...input,
          role: 'lecturer',
          tenantId: ctx.session!.tenantId,
          clerkUserId: '',
        })
        .returning();

      return created;
    }),

  update: adminProcedure
    .input(z.object({ id: z.string().uuid(), data: updateLecturerSchema }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(users)
        .set({ ...input.data, updatedAt: new Date() })
        .where(
          and(
            eq(users.id, input.id),
            eq(users.tenantId, ctx.session!.tenantId),
          ),
        )
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lecturer not found' });
      }

      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(users)
        .where(
          and(
            eq(users.id, input.id),
            eq(users.tenantId, ctx.session!.tenantId),
          ),
        )
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lecturer not found' });
      }

      return deleted;
    }),

  addDateException: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [lecturer] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, input.userId),
            eq(users.tenantId, ctx.session!.tenantId),
            eq(users.role, 'lecturer'),
          ),
        );

      if (!lecturer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lecturer not found' });
      }

      const [created] = await ctx.db
        .insert(lecturerDateExceptions)
        .values({ userId: input.userId, date: input.date, reason: input.reason })
        .onConflictDoNothing()
        .returning();

      if (!created) {
        // Already exists — fetch and return the existing row
        const [existing] = await ctx.db
          .select()
          .from(lecturerDateExceptions)
          .where(
            and(
              eq(lecturerDateExceptions.userId, input.userId),
              eq(lecturerDateExceptions.date, input.date),
            ),
          );
        return existing;
      }

      return created;
    }),

  removeDateException: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [exception] = await ctx.db
        .select({ id: lecturerDateExceptions.id })
        .from(lecturerDateExceptions)
        .innerJoin(users, eq(lecturerDateExceptions.userId, users.id))
        .where(
          and(
            eq(lecturerDateExceptions.id, input.id),
            eq(users.tenantId, ctx.session!.tenantId),
          ),
        );

      if (!exception) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Date exception not found' });
      }

      const [deleted] = await ctx.db
        .delete(lecturerDateExceptions)
        .where(eq(lecturerDateExceptions.id, input.id))
        .returning();

      return deleted;
    }),

  addDayException: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        dayOfWeek: z.enum([
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday',
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [lecturer] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, input.userId),
            eq(users.tenantId, ctx.session!.tenantId),
            eq(users.role, 'lecturer'),
          ),
        );

      if (!lecturer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lecturer not found' });
      }

      const [created] = await ctx.db
        .insert(lecturerDayExceptions)
        .values({ userId: input.userId, dayOfWeek: input.dayOfWeek })
        .onConflictDoNothing()
        .returning();

      if (!created) {
        // Already exists — fetch and return the existing row
        const [existing] = await ctx.db
          .select()
          .from(lecturerDayExceptions)
          .where(
            and(
              eq(lecturerDayExceptions.userId, input.userId),
              eq(lecturerDayExceptions.dayOfWeek, input.dayOfWeek),
            ),
          );
        return existing;
      }

      return created;
    }),

  removeDayException: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [exception] = await ctx.db
        .select({ id: lecturerDayExceptions.id })
        .from(lecturerDayExceptions)
        .innerJoin(users, eq(lecturerDayExceptions.userId, users.id))
        .where(
          and(
            eq(lecturerDayExceptions.id, input.id),
            eq(users.tenantId, ctx.session!.tenantId),
          ),
        );

      if (!exception) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Day exception not found' });
      }

      const [deleted] = await ctx.db
        .delete(lecturerDayExceptions)
        .where(eq(lecturerDayExceptions.id, input.id))
        .returning();

      return deleted;
    }),

  getExceptions: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [lecturer] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, input.userId),
            eq(users.tenantId, ctx.session!.tenantId),
            eq(users.role, 'lecturer'),
          ),
        );

      if (!lecturer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Lecturer not found' });
      }

      const [dateExceptions, dayExceptions] = await Promise.all([
        ctx.db
          .select()
          .from(lecturerDateExceptions)
          .where(eq(lecturerDateExceptions.userId, input.userId)),
        ctx.db
          .select()
          .from(lecturerDayExceptions)
          .where(eq(lecturerDayExceptions.userId, input.userId)),
      ]);

      return { dateExceptions, dayExceptions };
    }),
});
