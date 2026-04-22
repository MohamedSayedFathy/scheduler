import { index, pgTable, integer, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { courses } from './courses';
import { tenants } from './tenants';

export const studentGroups = pgTable(
  'student_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    year: integer('year'),
    size: integer('size').notNull(),
    color: text('color'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdIdx: index('student_groups_tenant_id_idx').on(table.tenantId),
  }),
);

export const courseStudentGroups = pgTable(
  'course_student_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    studentGroupId: uuid('student_group_id')
      .notNull()
      .references(() => studentGroups.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    courseIdIdx: index('course_student_groups_course_id_idx').on(table.courseId),
    studentGroupIdIdx: index('course_student_groups_sg_id_idx').on(table.studentGroupId),
  }),
);
