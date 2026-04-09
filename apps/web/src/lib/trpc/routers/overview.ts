import { desc, eq, sql } from 'drizzle-orm';

import { courses, generatedSchedules, rooms, studentGroups, timeSlots } from '@/lib/db/schema';
import { adminProcedure, createTRPCRouter } from '@/lib/trpc/trpc';

export const overviewRouter = createTRPCRouter({
  getStats: adminProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session!.tenantId;

    const [roomCountResult, courseCountResult, studentGroupCountResult, timeSlotCountResult] =
      await Promise.all([
        ctx.db.select({ count: sql<number>`count(*)` }).from(rooms).where(eq(rooms.tenantId, tenantId)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(courses).where(eq(courses.tenantId, tenantId)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(studentGroups).where(eq(studentGroups.tenantId, tenantId)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(timeSlots).where(eq(timeSlots.tenantId, tenantId)),
      ]);

    const [latestSchedule] = await ctx.db
      .select({
        id: generatedSchedules.id,
        name: generatedSchedules.name,
        status: generatedSchedules.status,
        createdAt: generatedSchedules.createdAt,
      })
      .from(generatedSchedules)
      .where(eq(generatedSchedules.tenantId, tenantId))
      .orderBy(desc(generatedSchedules.createdAt))
      .limit(1);

    return {
      roomCount: Number(roomCountResult[0]?.count ?? 0),
      courseCount: Number(courseCountResult[0]?.count ?? 0),
      studentGroupCount: Number(studentGroupCountResult[0]?.count ?? 0),
      timeSlotCount: Number(timeSlotCountResult[0]?.count ?? 0),
      latestSchedule: latestSchedule ?? null,
    };
  }),
});
