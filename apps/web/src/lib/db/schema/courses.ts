import { index, pgEnum, pgTable, integer, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { tenants } from './tenants';
import { users } from './users';

export const sessionTypeEnum = pgEnum('session_type', ['lecture', 'tutorial', 'lab']);

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    department: varchar('department', { length: 255 }),
    credits: integer('credits'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdIdx: index('courses_tenant_id_idx').on(table.tenantId),
  }),
);

export const courseSessions = pgTable(
  'course_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    sessionType: sessionTypeEnum('session_type').notNull(),
    durationSlots: integer('duration_slots').notNull().default(1),
    frequencyPerWeek: integer('frequency_per_week').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    courseIdIdx: index('course_sessions_course_id_idx').on(table.courseId),
  }),
);

export const courseLecturers = pgTable(
  'course_lecturers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    courseIdIdx: index('course_lecturers_course_id_idx').on(table.courseId),
    userIdIdx: index('course_lecturers_user_id_idx').on(table.userId),
  }),
);

export const sessionLecturers = pgTable(
  'session_lecturers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => courseSessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    sessionIdIdx: index('session_lecturers_session_id_idx').on(table.sessionId),
    userIdIdx: index('session_lecturers_user_id_idx').on(table.userId),
  }),
);
