import { TRPCError } from '@trpc/server';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

import { timeSlots } from '@/lib/db/schema';
import { adminProcedure, createTRPCRouter } from '@/lib/trpc/trpc';

const insertTimeSlotSchema = createInsertSchema(timeSlots).omit({
  id: true,
  tenantId: true,
  createdAt: true,
});

const dayOfWeekValues = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

function getDayOfWeek(dateStr: string): (typeof dayOfWeekValues)[number] {
  const d = new Date(dateStr + 'T00:00:00');
  const days = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ] as const;
  return days[d.getDay()] as (typeof dayOfWeekValues)[number];
}

function* dateRange(start: string, end: string): Generator<string> {
  const current = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (current <= endDate) {
    yield current.toISOString().split('T')[0]!;
    current.setDate(current.getDate() + 1);
  }
}

export const timeSlotsRouter = createTRPCRouter({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(timeSlots)
      .where(eq(timeSlots.tenantId, ctx.session!.tenantId))
      .orderBy(asc(timeSlots.date), asc(timeSlots.startTime));
  }),

  listByWeek: adminProcedure
    .input(
      z.object({
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
      }),
    )
    .query(async ({ ctx, input }) => {
      const start = new Date(input.weekStart + 'T00:00:00');
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const weekEnd = end.toISOString().split('T')[0]!;

      return ctx.db
        .select()
        .from(timeSlots)
        .where(
          and(
            eq(timeSlots.tenantId, ctx.session!.tenantId),
            gte(timeSlots.date, input.weekStart),
            lte(timeSlots.date, weekEnd),
          ),
        )
        .orderBy(asc(timeSlots.date), asc(timeSlots.startTime));
    }),

  create: adminProcedure
    .input(insertTimeSlotSchema)
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(timeSlots)
        .values({
          ...input,
          tenantId: ctx.session!.tenantId,
        })
        .returning();

      return created;
    }),

  bulkCreate: adminProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
        days: z.array(z.enum(dayOfWeekValues)),
        startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM'),
        endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM'),
        intervalMinutes: z.number().int().min(15).max(240),
        breakMinutes: z.number().int().min(0).max(60).default(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { startDate, endDate, days, startTime, endTime, intervalMinutes, breakMinutes } = input;
      const tenantId = ctx.session!.tenantId;

      if (startDate > endDate) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'startDate must be on or before endDate',
        });
      }

      const startParts = startTime.split(':').map(Number);
      const endParts = endTime.split(':').map(Number);
      const startTotalMinutes = (startParts[0] ?? 0) * 60 + (startParts[1] ?? 0);
      const endTotalMinutes = (endParts[0] ?? 0) * 60 + (endParts[1] ?? 0);

      if (startTotalMinutes >= endTotalMinutes) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'startTime must be before endTime',
        });
      }

      const slots: Array<{
        tenantId: string;
        date: string;
        dayOfWeek: (typeof dayOfWeekValues)[number];
        startTime: string;
        endTime: string;
      }> = [];

      for (const dateStr of dateRange(startDate, endDate)) {
        const dow = getDayOfWeek(dateStr);
        if (!days.includes(dow)) continue;

        let currentStart = startTotalMinutes;
        while (currentStart + intervalMinutes <= endTotalMinutes) {
          const currentEnd = currentStart + intervalMinutes;
          const slotStart = `${String(Math.floor(currentStart / 60)).padStart(2, '0')}:${String(currentStart % 60).padStart(2, '0')}`;
          const slotEnd = `${String(Math.floor(currentEnd / 60)).padStart(2, '0')}:${String(currentEnd % 60).padStart(2, '0')}`;

          slots.push({
            tenantId,
            date: dateStr,
            dayOfWeek: dow,
            startTime: slotStart,
            endTime: slotEnd,
          });

          currentStart = currentEnd + breakMinutes;
        }
      }

      if (slots.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No time slots could be generated with the given parameters',
        });
      }

      const created = await ctx.db.insert(timeSlots).values(slots).returning();

      return created;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(timeSlots)
        .where(and(eq(timeSlots.id, input.id), eq(timeSlots.tenantId, ctx.session!.tenantId)))
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Time slot not found' });
      }

      return deleted;
    }),

  deleteFromSlot: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select()
        .from(timeSlots)
        .where(and(eq(timeSlots.id, input.id), eq(timeSlots.tenantId, ctx.session!.tenantId)));

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Time slot not found' });
      }

      // Delete this same time slot on the same day of week, this date and all future dates
      const deleted = await ctx.db
        .delete(timeSlots)
        .where(
          and(
            eq(timeSlots.tenantId, ctx.session!.tenantId),
            eq(timeSlots.dayOfWeek, target.dayOfWeek),
            eq(timeSlots.startTime, target.startTime),
            eq(timeSlots.endTime, target.endTime),
            gte(timeSlots.date, target.date),
          ),
        )
        .returning();

      return deleted;
    }),

  deleteUntilSlot: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select()
        .from(timeSlots)
        .where(and(eq(timeSlots.id, input.id), eq(timeSlots.tenantId, ctx.session!.tenantId)));

      if (!target) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Time slot not found' });
      }

      // Delete this same time slot on the same day of week, this date and all past dates
      const deleted = await ctx.db
        .delete(timeSlots)
        .where(
          and(
            eq(timeSlots.tenantId, ctx.session!.tenantId),
            eq(timeSlots.dayOfWeek, target.dayOfWeek),
            eq(timeSlots.startTime, target.startTime),
            eq(timeSlots.endTime, target.endTime),
            lte(timeSlots.date, target.date),
          ),
        )
        .returning();

      return deleted;
    }),

  deleteAllOnDay: adminProcedure
    .input(z.object({ dayOfWeek: z.enum(dayOfWeekValues) }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db
        .delete(timeSlots)
        .where(
          and(
            eq(timeSlots.tenantId, ctx.session!.tenantId),
            eq(timeSlots.dayOfWeek, input.dayOfWeek),
          ),
        )
        .returning();

      return deleted;
    }),

  deleteAll: adminProcedure.mutation(async ({ ctx }) => {
    const deleted = await ctx.db
      .delete(timeSlots)
      .where(eq(timeSlots.tenantId, ctx.session!.tenantId))
      .returning();

    return deleted;
  }),
});
