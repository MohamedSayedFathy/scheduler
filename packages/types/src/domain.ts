/**
 * Core domain types for the scheduling system.
 *
 * These mirror the database entities and are used across API boundaries.
 * They should NOT import from Drizzle or any DB-specific libs.
 */

import { z } from 'zod';

// ---------- Primitives ----------

export const UuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof UuidSchema>;

export const DayOfWeekSchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;

// HH:MM 24-hour format
export const TimeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM 24-hour time');
export type TimeString = z.infer<typeof TimeStringSchema>;

// ---------- Enums ----------

export const UserRoleSchema = z.enum([
  'super_admin',
  'university_admin',
  'lecturer',
  'student',
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const RoomTypeSchema = z.enum([
  'lecture_hall',
  'lab',
  'tutorial_room',
  'seminar_room',
  'computer_lab',
]);
export type RoomType = z.infer<typeof RoomTypeSchema>;

export const SessionTypeSchema = z.enum(['lecture', 'tutorial', 'lab']);
export type SessionType = z.infer<typeof SessionTypeSchema>;

export const TenantStatusSchema = z.enum(['active', 'suspended', 'trial', 'cancelled']);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const ScheduleStatusSchema = z.enum([
  'pending',
  'solving',
  'solved',
  'infeasible',
  'failed',
]);
export type ScheduleStatus = z.infer<typeof ScheduleStatusSchema>;

// ---------- Constraint configuration ----------

export const ConstraintTypeSchema = z.enum([
  // Hard
  'room_no_double_booking',
  'lecturer_no_double_booking',
  'student_group_no_double_booking',
  'room_capacity',
  'room_type_match',
  'lecturer_availability',
  'contiguous_multi_slot',
  // Soft
  'minimize_lecturer_gaps',
  'minimize_student_gaps',
  'respect_lecturer_room_preference',
  'respect_lecturer_time_preference',
  'distribute_load_evenly',
  'minimize_building_travel',
]);
export type ConstraintType = z.infer<typeof ConstraintTypeSchema>;

export const ConstraintSeveritySchema = z.enum(['hard', 'soft']);
export type ConstraintSeverity = z.infer<typeof ConstraintSeveritySchema>;
