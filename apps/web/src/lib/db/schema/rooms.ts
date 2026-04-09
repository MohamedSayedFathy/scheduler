import { index, pgEnum, pgTable, integer, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { tenants } from './tenants';

export const roomTypeEnum = pgEnum('room_type', [
  'lecture_hall',
  'lab',
  'tutorial_room',
  'seminar_room',
  'computer_lab',
]);

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    building: varchar('building', { length: 255 }),
    capacity: integer('capacity').notNull(),
    roomType: roomTypeEnum('room_type').notNull(),
    equipment: text('equipment').array(), // e.g. ["projector", "whiteboard", "computers"]
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdIdx: index('rooms_tenant_id_idx').on(table.tenantId),
  }),
);
