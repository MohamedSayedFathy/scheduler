import { describe, expect, it } from 'vitest';

import { detectConflicts, type ConflictInputs } from './conflicts';

const baseRoom = { id: 'room-1', capacity: 30, roomType: 'lecture_hall' };
const baseTimeSlot = { id: 'ts-1', dayOfWeek: 'monday', startTime: '09:00', endTime: '10:00', date: '2025-01-06' };
const baseSession = {
  id: 'session-1',
  sessionType: 'lecture',
  requiredRoomType: 'lecture_hall',
  durationSlots: 1,
  lecturerIds: ['lecturer-1'],
  studentGroupIds: ['sg-1'],
};
const baseStudentGroup = { id: 'sg-1', size: 20 };
const baseAvailability: Map<string, Set<string>> = new Map([
  ['lecturer-1', new Set(['ts-1', 'ts-2', 'ts-3'])],
]);

function makeInputs(overrides: Partial<ConflictInputs> = {}): ConflictInputs {
  return {
    entries: [{ id: 'entry-1', sessionId: 'session-1', roomId: 'room-1', timeSlotId: 'ts-1' }],
    sessions: [baseSession],
    rooms: [baseRoom],
    timeSlots: [baseTimeSlot],
    studentGroups: [baseStudentGroup],
    lecturerAvailability: baseAvailability,
    ...overrides,
  };
}

describe('detectConflicts', () => {
  describe('room_double_booking', () => {
    it('returns no conflict when each entry has its own time slot', () => {
      const inputs = makeInputs({
        entries: [
          { id: 'entry-1', sessionId: 'session-1', roomId: 'room-1', timeSlotId: 'ts-1' },
          { id: 'entry-2', sessionId: 'session-2', roomId: 'room-1', timeSlotId: 'ts-2' },
        ],
        sessions: [
          baseSession,
          { ...baseSession, id: 'session-2' },
        ],
        timeSlots: [
          baseTimeSlot,
          { id: 'ts-2', dayOfWeek: 'monday', startTime: '10:00', endTime: '11:00', date: '2025-01-06' },
        ],
      });
      const result = detectConflicts(inputs);
      expect(result.filter((c) => c.kind === 'room_double_booking')).toHaveLength(0);
    });

    it('returns a conflict when two entries share the same room and time slot', () => {
      const inputs = makeInputs({
        entries: [
          { id: 'entry-1', sessionId: 'session-1', roomId: 'room-1', timeSlotId: 'ts-1' },
          { id: 'entry-2', sessionId: 'session-2', roomId: 'room-1', timeSlotId: 'ts-1' },
        ],
        sessions: [
          baseSession,
          { ...baseSession, id: 'session-2', lecturerIds: ['lecturer-2'], studentGroupIds: ['sg-2'] },
        ],
        studentGroups: [baseStudentGroup, { id: 'sg-2', size: 5 }],
        lecturerAvailability: new Map([
          ['lecturer-1', new Set(['ts-1'])],
          ['lecturer-2', new Set(['ts-1'])],
        ]),
      });
      const result = detectConflicts(inputs);
      expect(result.filter((c) => c.kind === 'room_double_booking')).toHaveLength(1);
    });
  });

  describe('lecturer_double_booking', () => {
    it('returns no conflict when lecturer has different time slots', () => {
      const inputs = makeInputs({
        entries: [
          { id: 'entry-1', sessionId: 'session-1', roomId: 'room-1', timeSlotId: 'ts-1' },
          { id: 'entry-2', sessionId: 'session-2', roomId: 'room-2', timeSlotId: 'ts-2' },
        ],
        sessions: [
          baseSession,
          { ...baseSession, id: 'session-2' },
        ],
        rooms: [baseRoom, { id: 'room-2', capacity: 30, roomType: 'lecture_hall' }],
        timeSlots: [
          baseTimeSlot,
          { id: 'ts-2', dayOfWeek: 'monday', startTime: '10:00', endTime: '11:00', date: '2025-01-06' },
        ],
        lecturerAvailability: new Map([['lecturer-1', new Set(['ts-1', 'ts-2'])]]),
      });
      const result = detectConflicts(inputs);
      expect(result.filter((c) => c.kind === 'lecturer_double_booking')).toHaveLength(0);
    });

    it('returns a conflict when the same lecturer is in two sessions at the same time', () => {
      const inputs = makeInputs({
        entries: [
          { id: 'entry-1', sessionId: 'session-1', roomId: 'room-1', timeSlotId: 'ts-1' },
          { id: 'entry-2', sessionId: 'session-2', roomId: 'room-2', timeSlotId: 'ts-1' },
        ],
        sessions: [
          baseSession,
          { ...baseSession, id: 'session-2', studentGroupIds: ['sg-2'] },
        ],
        rooms: [baseRoom, { id: 'room-2', capacity: 30, roomType: 'lecture_hall' }],
        studentGroups: [baseStudentGroup, { id: 'sg-2', size: 5 }],
        lecturerAvailability: new Map([['lecturer-1', new Set(['ts-1'])]]),
      });
      const result = detectConflicts(inputs);
      expect(result.filter((c) => c.kind === 'lecturer_double_booking')).toHaveLength(1);
    });
  });

  describe('student_group_double_booking', () => {
    it('returns no conflict when student group has different time slots', () => {
      const inputs = makeInputs({
        entries: [
          { id: 'entry-1', sessionId: 'session-1', roomId: 'room-1', timeSlotId: 'ts-1' },
          { id: 'entry-2', sessionId: 'session-2', roomId: 'room-2', timeSlotId: 'ts-2' },
        ],
        sessions: [
          baseSession,
          { ...baseSession, id: 'session-2', lecturerIds: ['lecturer-2'] },
        ],
        rooms: [baseRoom, { id: 'room-2', capacity: 30, roomType: 'lecture_hall' }],
        timeSlots: [
          baseTimeSlot,
          { id: 'ts-2', dayOfWeek: 'monday', startTime: '10:00', endTime: '11:00', date: '2025-01-06' },
        ],
        lecturerAvailability: new Map([
          ['lecturer-1', new Set(['ts-1', 'ts-2'])],
          ['lecturer-2', new Set(['ts-1', 'ts-2'])],
        ]),
      });
      const result = detectConflicts(inputs);
      expect(result.filter((c) => c.kind === 'student_group_double_booking')).toHaveLength(0);
    });

    it('returns a conflict when the same student group is in two sessions at the same time', () => {
      const inputs = makeInputs({
        entries: [
          { id: 'entry-1', sessionId: 'session-1', roomId: 'room-1', timeSlotId: 'ts-1' },
          { id: 'entry-2', sessionId: 'session-2', roomId: 'room-2', timeSlotId: 'ts-1' },
        ],
        sessions: [
          baseSession,
          { ...baseSession, id: 'session-2', lecturerIds: ['lecturer-2'] },
        ],
        rooms: [baseRoom, { id: 'room-2', capacity: 30, roomType: 'lecture_hall' }],
        lecturerAvailability: new Map([
          ['lecturer-1', new Set(['ts-1'])],
          ['lecturer-2', new Set(['ts-1'])],
        ]),
      });
      const result = detectConflicts(inputs);
      expect(result.filter((c) => c.kind === 'student_group_double_booking')).toHaveLength(1);
    });
  });

  describe('room_capacity', () => {
    it('returns no conflict when total size is within capacity', () => {
      const result = detectConflicts(makeInputs());
      expect(result.filter((c) => c.kind === 'room_capacity')).toHaveLength(0);
    });

    it('returns a conflict when total student group size exceeds room capacity', () => {
      const inputs = makeInputs({
        studentGroups: [{ id: 'sg-1', size: 50 }],
      });
      const result = detectConflicts(inputs);
      expect(result.filter((c) => c.kind === 'room_capacity')).toHaveLength(1);
      expect(result[0]?.message).toContain('exceeded');
    });
  });

  describe('room_type_mismatch', () => {
    it('returns no conflict when room type matches required type', () => {
      const result = detectConflicts(makeInputs());
      expect(result.filter((c) => c.kind === 'room_type_mismatch')).toHaveLength(0);
    });

    it('returns a conflict when room type does not match required type', () => {
      const inputs = makeInputs({
        sessions: [{ ...baseSession, requiredRoomType: 'lab' }],
      });
      const result = detectConflicts(inputs);
      expect(result.filter((c) => c.kind === 'room_type_mismatch')).toHaveLength(1);
      expect(result[0]?.message).toContain('lab');
    });

    it('returns no conflict when requiredRoomType is not set', () => {
      const inputs = makeInputs({
        sessions: [{ ...baseSession, requiredRoomType: undefined }],
      });
      const result = detectConflicts(inputs);
      expect(result.filter((c) => c.kind === 'room_type_mismatch')).toHaveLength(0);
    });
  });

  describe('lecturer_unavailable', () => {
    it('returns no conflict when lecturer is available at the time slot', () => {
      const result = detectConflicts(makeInputs());
      expect(result.filter((c) => c.kind === 'lecturer_unavailable')).toHaveLength(0);
    });

    it('returns a conflict when lecturer is not available at the time slot', () => {
      const inputs = makeInputs({
        lecturerAvailability: new Map([['lecturer-1', new Set(['ts-2', 'ts-3'])]]),
      });
      const result = detectConflicts(inputs);
      expect(result.filter((c) => c.kind === 'lecturer_unavailable')).toHaveLength(1);
    });

    it('returns no conflict when lecturer has no availability record (treated as available)', () => {
      const inputs = makeInputs({
        lecturerAvailability: new Map(),
      });
      const result = detectConflicts(inputs);
      expect(result.filter((c) => c.kind === 'lecturer_unavailable')).toHaveLength(0);
    });
  });
});
