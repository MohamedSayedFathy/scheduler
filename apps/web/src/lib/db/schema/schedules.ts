import { date, index, integer, pgEnum, pgTable, text, time, timestamp, uuid } from 'drizzle-orm/pg-core';

import { courseSessions } from './courses';
import { rooms } from './rooms';
import { tenants } from './tenants';
import { timeSlots } from './time-slots';
import { users } from './users';

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
    assignedLecturerId: uuid('assigned_lecturer_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scheduleIdIdx: index('schedule_entries_schedule_id_idx').on(table.scheduleId),
    sessionIdIdx: index('schedule_entries_session_id_idx').on(table.sessionId),
    roomIdIdx: index('schedule_entries_room_id_idx').on(table.roomId),
    timeSlotIdIdx: index('schedule_entries_ts_id_idx').on(table.timeSlotId),
    assignedLecturerIdIdx: index('schedule_entries_assigned_lecturer_id_idx').on(
      table.assignedLecturerId,
    ),
  }),
);

export const scheduleEvents = pgTable(
  'schedule_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => generatedSchedules.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    date: date('date').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scheduleIdIdx: index('schedule_events_schedule_id_idx').on(table.scheduleId),
    dateIdx: index('schedule_events_date_idx').on(table.date),
  }),
);

export const scheduleVersions = pgTable(
  'schedule_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => generatedSchedules.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    entriesSnapshot: text('entries_snapshot').notNull(),
    conflictCount: integer('conflict_count').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scheduleIdIdx: index('schedule_versions_schedule_id_idx').on(table.scheduleId),
    tenantIdIdx: index('schedule_versions_tenant_id_idx').on(table.tenantId),
  }),
);
