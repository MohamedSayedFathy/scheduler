import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

import { courseStudentGroups, courses, studentGroups } from '@/lib/db/schema';
import { adminProcedure, createTRPCRouter } from '@/lib/trpc/trpc';

const insertStudentGroupSchema = createInsertSchema(studentGroups).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});

const updateStudentGroupSchema = insertStudentGroupSchema.partial();

export const studentGroupsRouter = createTRPCRouter({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(studentGroups).where(eq(studentGroups.tenantId, ctx.session!.tenantId));
  }),

  getById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [group] = await ctx.db
        .select()
        .from(studentGroups)
        .where(and(eq(studentGroups.id, input.id), eq(studentGroups.tenantId, ctx.session!.tenantId)));

      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Student group not found' });
      }

      const enrollments = await ctx.db
        .select()
        .from(courseStudentGroups)
        .where(eq(courseStudentGroups.studentGroupId, input.id));

      return { ...group, courseEnrollments: enrollments };
    }),

  create: adminProcedure
    .input(insertStudentGroupSchema)
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(studentGroups)
        .values({
          ...input,
          tenantId: ctx.session!.tenantId,
        })
        .returning();

      return created;
    }),

  update: adminProcedure
    .input(z.object({ id: z.string().uuid(), data: updateStudentGroupSchema }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(studentGroups)
        .set({ ...input.data, updatedAt: new Date() })
        .where(and(eq(studentGroups.id, input.id), eq(studentGroups.tenantId, ctx.session!.tenantId)))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Student group not found' });
      }

      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(studentGroups)
        .where(and(eq(studentGroups.id, input.id), eq(studentGroups.tenantId, ctx.session!.tenantId)))
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Student group not found' });
      }

      return deleted;
    }),

  addCourse: adminProcedure
    .input(z.object({ studentGroupId: z.string().uuid(), courseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [group] = await ctx.db
        .select({ id: studentGroups.id })
        .from(studentGroups)
        .where(and(eq(studentGroups.id, input.studentGroupId), eq(studentGroups.tenantId, ctx.session!.tenantId)));
      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Student group not found' });
      }

      const [course] = await ctx.db
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.id, input.courseId), eq(courses.tenantId, ctx.session!.tenantId)));
      if (!course) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
      }

      const [created] = await ctx.db
        .insert(courseStudentGroups)
        .values(input)
        .returning();

      return created;
    }),

  removeCourse: adminProcedure
    .input(z.object({ studentGroupId: z.string().uuid(), courseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [group] = await ctx.db
        .select({ id: studentGroups.id })
        .from(studentGroups)
        .where(and(eq(studentGroups.id, input.studentGroupId), eq(studentGroups.tenantId, ctx.session!.tenantId)));
      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Student group not found' });
      }

      const [course] = await ctx.db
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.id, input.courseId), eq(courses.tenantId, ctx.session!.tenantId)));
      if (!course) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
      }

      const [deleted] = await ctx.db
        .delete(courseStudentGroups)
        .where(
          and(
            eq(courseStudentGroups.studentGroupId, input.studentGroupId),
            eq(courseStudentGroups.courseId, input.courseId),
          ),
        )
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Course enrollment not found' });
      }

      return deleted;
    }),
});
