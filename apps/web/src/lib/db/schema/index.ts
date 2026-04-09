/**
 * Drizzle schema barrel export.
 *
 * Every table, enum, and relation defined in this directory is re-exported
 * here. The Drizzle client uses these to provide type-safe query building.
 */

export * from './tenants';
export * from './users';
export * from './rooms';
export * from './courses';
export * from './student-groups';
export * from './time-slots';
export * from './lecturer-availability';
export * from './constraints';
export * from './schedules';
export * from './audit-logs';
export * from './subscriptions';
