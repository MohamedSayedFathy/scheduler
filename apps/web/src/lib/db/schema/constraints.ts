import { index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { tenants } from './tenants';

export const constraintSeverityEnum = pgEnum('constraint_severity', ['hard', 'soft']);

export const schedulingConstraints = pgTable(
  'scheduling_constraints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    constraintType: varchar('constraint_type', { length: 100 }).notNull(),
    severity: constraintSeverityEnum('severity').notNull(),
    weight: integer('weight').notNull().default(1), // 0-1000, only used for soft constraints
    config: text('config').notNull().default('{}'), // JSON blob for constraint-specific params
    description: varchar('description', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdIdx: index('constraints_tenant_id_idx').on(table.tenantId),
  }),
);
