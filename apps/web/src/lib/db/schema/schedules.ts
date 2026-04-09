import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { courseSessions } from './courses';
import { rooms } from './rooms';
import { tenants } from './tenants';
import { timeSlots } from './time-slots';

export const scheduleStatusEnum = pgEnum('schedule_status', [
  'pending',
  'solving',
  'solved',
  'infeasible',
  'failed',
]);

export const generatedSchedules = pgTable(
  'generated_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name'),
    status: scheduleStatusEnum('status').notNull().default('pending'),
    solverStats: text('solver_stats'), // JSON blob of EngineSolverStats
    errorMessage: text('error_message'),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdIdx: index('schedules_tenant_id_idx').on(table.tenantId),
    statusIdx: index('schedules_status_idx').on(table.status),
  }),
);

export const scheduleEntries = pgTable(
  'schedule_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => generatedSchedules.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => courseSessions.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    timeSlotId: uuid('time_slot_id')
      .notNull()
      .references(() => timeSlots.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scheduleIdIdx: index('schedule_entries_schedule_id_idx').on(table.scheduleId),
    sessionIdIdx: index('schedule_entries_session_id_idx').on(table.sessionId),
    roomIdIdx: index('schedule_entries_room_id_idx').on(table.roomId),
    timeSlotIdIdx: index('schedule_entries_ts_id_idx').on(table.timeSlotId),
  }),
);
