import { date, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { dayOfWeekEnum } from './time-slots';
import { users } from './users';

/**
 * Specific dates a lecturer is NOT available (e.g., sick day, conference).
 * Lecturers are considered available by default on all dates not listed here.
 */
export const lecturerDateExceptions = pgTable(
  'lecturer_date_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    reason: text('reason'),
  },
  (table) => ({
    userIdIdx: index('lecturer_date_exceptions_user_id_idx').on(table.userId),
    dateIdx: index('lecturer_date_exceptions_date_idx').on(table.date),
    userDateUnique: unique('lecturer_date_exceptions_user_date_unique').on(table.userId, table.date),
  }),
);

/**
 * Recurring weekly days a lecturer is NEVER available (e.g., every Thursday).
 * Lecturers are considered available on all days not listed here.
 */
export const lecturerDayExceptions = pgTable(
  'lecturer_day_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dayOfWeek: dayOfWeekEnum('day_of_week').notNull(),
  },
  (table) => ({
    userIdIdx: index('lecturer_day_exceptions_user_id_idx').on(table.userId),
    userDayUnique: unique('lecturer_day_exceptions_user_day_unique').on(table.userId, table.dayOfWeek),
  }),
);
