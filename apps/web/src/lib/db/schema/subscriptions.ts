import { index, integer, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { tenants } from './tenants';

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'cancelled',
  'incomplete',
  'trialing',
]);

export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'free',
  'starter',
  'pro',
  'enterprise',
]);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    status: subscriptionStatusEnum('status').notNull().default('trialing'),
    plan: subscriptionPlanEnum('plan').notNull().default('free'),
    seats: integer('seats').notNull().default(5),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: timestamp('cancel_at_period_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdIdx: index('subscriptions_tenant_id_idx').on(table.tenantId),
    stripeIdIdx: index('subscriptions_stripe_id_idx').on(table.stripeSubscriptionId),
  }),
);
