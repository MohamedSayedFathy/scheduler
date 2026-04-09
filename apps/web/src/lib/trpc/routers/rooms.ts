import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

import { rooms } from '@/lib/db/schema';
import { adminProcedure, createTRPCRouter } from '@/lib/trpc/trpc';

const insertRoomSchema = createInsertSchema(rooms, {
  equipment: z.array(z.string()).nullable().optional(),
}).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});

const updateRoomSchema = insertRoomSchema.partial();

export const roomsRouter = createTRPCRouter({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(rooms).where(eq(rooms.tenantId, ctx.session!.tenantId));
  }),

  getById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [room] = await ctx.db
        .select()
        .from(rooms)
        .where(and(eq(rooms.id, input.id), eq(rooms.tenantId, ctx.session!.tenantId)));

      if (!room) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });
      }

      return room;
    }),

  create: adminProcedure
    .input(insertRoomSchema)
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(rooms)
        .values({
          ...input,
          tenantId: ctx.session!.tenantId,
        })
        .returning();

      return created;
    }),

  update: adminProcedure
    .input(z.object({ id: z.string().uuid(), data: updateRoomSchema }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(rooms)
        .set({ ...input.data, updatedAt: new Date() })
        .where(and(eq(rooms.id, input.id), eq(rooms.tenantId, ctx.session!.tenantId)))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });
      }

      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(rooms)
        .where(and(eq(rooms.id, input.id), eq(rooms.tenantId, ctx.session!.tenantId)))
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Room not found' });
      }

      return deleted;
    }),
});
