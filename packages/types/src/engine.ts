/**
 * Engine API contract — shared between Next.js app and Python scheduling engine.
 *
 * IMPORTANT: This is the source of truth for the engine wire format.
 * The Python engine's Pydantic schemas (engine/src/api/schemas.py) MUST match
 * these definitions exactly. Any change here requires a matching change there.
 */

import { z } from 'zod';

import {
  ConstraintSeveritySchema,
  ConstraintTypeSchema,
  DayOfWeekSchema,
  RoomTypeSchema,
  SessionTypeSchema,
  TimeStringSchema,
  UuidSchema,
} from './domain';

// ---------- Input payload (Next.js -> Engine) ----------

export const EngineRoomSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(255),
  capacity: z.number().int().min(1).max(10000),
  roomType: RoomTypeSchema,
  building: z.string().max(255).optional(),
  equipment: z.array(z.string().max(100)).max(50).default([]),
});
export type EngineRoom = z.infer<typeof EngineRoomSchema>;

export const EngineTimeSlotSchema = z.object({
  id: UuidSchema,
  dayOfWeek: DayOfWeekSchema,
  startTime: TimeStringSchema,
  endTime: TimeStringSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type EngineTimeSlot = z.infer<typeof EngineTimeSlotSchema>;

export const EngineLecturerSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(255),
  availableTimeSlotIds: z.array(UuidSchema),
  preferredRoomIds: z.array(UuidSchema).default([]),
  preferredTimeSlotIds: z.array(UuidSchema).default([]),
  maxConsecutiveSlots: z.number().int().min(1).max(12).default(4),
});
export type EngineLecturer = z.infer<typeof EngineLecturerSchema>;

export const EngineStudentGroupSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(255),
  size: z.number().int().min(1).max(10000),
});
export type EngineStudentGroup = z.infer<typeof EngineStudentGroupSchema>;

export const EngineSessionSchema = z.object({
  id: z.string().min(1), // May include week/frequency suffix e.g. "{uuid}_w0_f0"
  courseId: UuidSchema,
  courseCode: z.string().min(1).max(50),
  sessionType: SessionTypeSchema,
  durationSlots: z.number().int().min(1).max(12),
  lecturerIds: z.array(UuidSchema).min(1),
  studentGroupIds: z.array(UuidSchema).min(1),
  requiredRoomType: RoomTypeSchema.optional(),
  requiredEquipment: z.array(z.string()).default([]),
  allowedTimeSlotIds: z.array(UuidSchema).optional(),
});
export type EngineSession = z.infer<typeof EngineSessionSchema>;

export const EngineConstraintSchema = z.object({
  type: ConstraintTypeSchema,
  severity: ConstraintSeveritySchema,
  weight: z.number().min(0).max(1000).default(1),
  config: z.record(z.unknown()).default({}),
});
export type EngineConstraint = z.infer<typeof EngineConstraintSchema>;

export const EngineSolverConfigSchema = z.object({
  timeoutSeconds: z.number().int().min(5).max(3600).default(60),
  numWorkers: z.number().int().min(1).max(16).default(4),
  randomSeed: z.number().int().optional(),
});
export type EngineSolverConfig = z.infer<typeof EngineSolverConfigSchema>;

export const EngineSolveRequestSchema = z.object({
  tenantId: UuidSchema,
  scheduleId: UuidSchema,
  callbackUrl: z.string().url(),
  rooms: z.array(EngineRoomSchema).min(1),
  timeSlots: z.array(EngineTimeSlotSchema).min(1),
  lecturers: z.array(EngineLecturerSchema).min(1),
  studentGroups: z.array(EngineStudentGroupSchema).min(1),
  sessions: z.array(EngineSessionSchema).min(1),
  constraints: z.array(EngineConstraintSchema).default([]),
  solverConfig: EngineSolverConfigSchema.default({}),
});
export type EngineSolveRequest = z.infer<typeof EngineSolveRequestSchema>;

export const EngineSolveAcceptedResponseSchema = z.object({
  jobId: UuidSchema,
  status: z.literal('accepted'),
  estimatedTimeSeconds: z.number().int().min(0),
});
export type EngineSolveAcceptedResponse = z.infer<typeof EngineSolveAcceptedResponseSchema>;

// ---------- Result (Engine -> Next.js callback webhook) ----------

export const EngineScheduleEntrySchema = z.object({
  sessionId: z.string().min(1), // May include week/frequency suffix e.g. "{uuid}_w0_f0"
  roomId: UuidSchema,
  timeSlotIds: z.array(UuidSchema).min(1), // length > 1 for multi-slot sessions
  assignedLecturerId: z.string().nullable().default(null),
});
export type EngineScheduleEntry = z.infer<typeof EngineScheduleEntrySchema>;

export const EngineConflictSchema = z.object({
  constraintType: ConstraintTypeSchema,
  message: z.string(),
  involvedSessionIds: z.array(z.string()).default([]),
  involvedRoomIds: z.array(UuidSchema).default([]),
  involvedLecturerIds: z.array(UuidSchema).default([]),
});
export type EngineConflict = z.infer<typeof EngineConflictSchema>;

export const EngineSolverStatsSchema = z.object({
  status: z.enum(['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'UNKNOWN', 'MODEL_INVALID']),
  wallTimeSeconds: z.number().min(0),
  objectiveValue: z.number().nullable(),
  numBranches: z.number().int().min(0),
  numConflicts: z.number().int().min(0),
  softConstraintScores: z.record(z.number()).default({}),
});
export type EngineSolverStats = z.infer<typeof EngineSolverStatsSchema>;

export const EngineSolveResultSchema = z.object({
  jobId: UuidSchema,
  tenantId: UuidSchema,
  scheduleId: UuidSchema,
  status: z.enum(['solved', 'infeasible', 'failed', 'timeout']),
  entries: z.array(EngineScheduleEntrySchema).default([]),
  conflicts: z.array(EngineConflictSchema).default([]),
  stats: EngineSolverStatsSchema,
  errorMessage: z.string().nullable().default(null),
});
export type EngineSolveResult = z.infer<typeof EngineSolveResultSchema>;

// ---------- Health check ----------

export const EngineHealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  orToolsVersion: z.string(),
});
export type EngineHealthResponse = z.infer<typeof EngineHealthResponseSchema>;
