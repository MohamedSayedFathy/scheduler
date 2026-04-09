/**
 * Seed script — populates the database with a large, realistic university dataset.
 *
 * Usage:
 *   cd apps/web
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/seed.ts
 *
 * Dataset size:
 *   - 50 lecturers
 *   - 70 courses across 10 departments (~150+ sessions)
 *   - 12 student groups (4 years × 3 groups)
 *   - 19 rooms
 *   - ~17 weeks of time slots (2026-04-13 → 2026-08-07), Mon-Fri 08:00-18:00
 *   - Lecturer day/date exceptions
 *   - Default scheduling constraints
 */

import * as readline from 'readline';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../src/lib/db/schema';

const {
  tenants,
  users,
  rooms,
  courses,
  courseSessions,
  courseLecturers,
  sessionLecturers,
  studentGroups,
  courseStudentGroups,
  timeSlots,
  lecturerDayExceptions,
  lecturerDateExceptions,
  schedulingConstraints,
  generatedSchedules,
} = schema;

// ── Connect ─────────────────────────────────────────────────────────
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });
const db = drizzle(sql, { schema });

// ── Helpers ─────────────────────────────────────────────────────────
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function getDayOfWeek(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
  return days[d.getUTCDay()]!;
}

/** Deterministic pick: wraps index into an array without Math.random(). */
function pick<T>(arr: T[], index: number): T {
  return arr[index % arr.length]!;
}

// ── Seed data definitions ───────────────────────────────────────────

/**
 * 50 lecturers — diverse, international names.
 * Assigned to departments in blocks of 5 (10 departments × 5 lecturers each).
 * Block 0  (idx 0-4)  → Computer Science
 * Block 1  (idx 5-9)  → Mathematics
 * Block 2  (idx 10-14)→ Physics
 * Block 3  (idx 15-19)→ Chemistry
 * Block 4  (idx 20-24)→ Biology
 * Block 5  (idx 25-29)→ Engineering
 * Block 6  (idx 30-34)→ Economics
 * Block 7  (idx 35-39)→ Business
 * Block 8  (idx 40-44)→ Literature
 * Block 9  (idx 45-49)→ Psychology
 */
const LECTURERS = [
  // CS (0-4)
  { firstName: 'Ahmed', lastName: 'Hassan' },
  { firstName: 'Mei', lastName: 'Lin' },
  { firstName: 'Dmitri', lastName: 'Volkov' },
  { firstName: 'Amara', lastName: 'Diallo' },
  { firstName: 'Lucas', lastName: 'Ferreira' },
  // Math (5-9)
  { firstName: 'Fatima', lastName: 'Al-Rashid' },
  { firstName: 'Hiroshi', lastName: 'Tanaka' },
  { firstName: 'Ingrid', lastName: 'Lindqvist' },
  { firstName: 'Kofi', lastName: 'Mensah' },
  { firstName: 'Priya', lastName: 'Nair' },
  // Physics (10-14)
  { firstName: 'Omar', lastName: 'Khalil' },
  { firstName: 'Sophia', lastName: 'Bauer' },
  { firstName: 'Rafael', lastName: 'Morales' },
  { firstName: 'Yuki', lastName: 'Nakamura' },
  { firstName: 'Chidinma', lastName: 'Okafor' },
  // Chemistry (15-19)
  { firstName: 'Sara', lastName: 'Mahmoud' },
  { firstName: 'Piotr', lastName: 'Kowalski' },
  { firstName: 'Aisha', lastName: 'Mwangi' },
  { firstName: 'Ethan', lastName: 'Novak' },
  { firstName: 'Lin', lastName: 'Wei' },
  // Biology (20-24)
  { firstName: 'Youssef', lastName: 'Ibrahim' },
  { firstName: 'Elena', lastName: 'Sokolova' },
  { firstName: 'Tariq', lastName: 'Al-Amin' },
  { firstName: 'Beatriz', lastName: 'Santos' },
  { firstName: 'Jae-Won', lastName: 'Kim' },
  // Engineering (25-29)
  { firstName: 'Nour', lastName: 'Abdel-Fattah' },
  { firstName: 'Viktor', lastName: 'Petrov' },
  { firstName: 'Adaeze', lastName: 'Nwosu' },
  { firstName: 'Sebastián', lastName: 'Castro' },
  { firstName: 'Haruto', lastName: 'Yamamoto' },
  // Economics (30-34)
  { firstName: 'Khaled', lastName: 'Mostafa' },
  { firstName: 'Anna', lastName: 'Bergström' },
  { firstName: 'Obinna', lastName: 'Eze' },
  { firstName: 'Clara', lastName: 'Dupont' },
  { firstName: 'Arjun', lastName: 'Sharma' },
  // Business (35-39)
  { firstName: 'Layla', lastName: 'Zaki' },
  { firstName: 'Tomás', lastName: 'García' },
  { firstName: 'Nkechi', lastName: 'Adeyemi' },
  { firstName: 'Olga', lastName: 'Morozova' },
  { firstName: 'Wei', lastName: 'Zhang' },
  // Literature (40-44)
  { firstName: 'Tarek', lastName: 'Sameer' },
  { firstName: 'Maeve', lastName: 'O\'Sullivan' },
  { firstName: 'Ravi', lastName: 'Krishnan' },
  { firstName: 'Amelia', lastName: 'Fischer' },
  { firstName: 'Zara', lastName: 'Al-Faris' },
  // Psychology (45-49)
  { firstName: 'Hana', lastName: 'El-Sayed' },
  { firstName: 'Luca', lastName: 'Romano' },
  { firstName: 'Yewande', lastName: 'Adebayo' },
  { firstName: 'Sven', lastName: 'Eriksson' },
  { firstName: 'Meera', lastName: 'Pillai' },
];

// ── Rooms (19) ────────────────────────────────────────────────────────
const ROOMS_DATA = [
  // Lecture halls
  { name: 'Hall A-101', building: 'Building A', capacity: 300, roomType: 'lecture_hall' as const, equipment: ['projector', 'microphone', 'whiteboard'] },
  { name: 'Hall A-102', building: 'Building A', capacity: 250, roomType: 'lecture_hall' as const, equipment: ['projector', 'microphone'] },
  { name: 'Hall B-201', building: 'Building B', capacity: 200, roomType: 'lecture_hall' as const, equipment: ['projector', 'whiteboard'] },
  { name: 'Hall C-101', building: 'Building C', capacity: 180, roomType: 'lecture_hall' as const, equipment: ['projector', 'microphone', 'whiteboard'] },
  { name: 'Hall D-101', building: 'Building D', capacity: 150, roomType: 'lecture_hall' as const, equipment: ['projector', 'microphone'] },
  { name: 'Hall E-201', building: 'Building E', capacity: 120, roomType: 'lecture_hall' as const, equipment: ['projector', 'whiteboard'] },
  // Tutorial rooms
  { name: 'Room A-201', building: 'Building A', capacity: 60, roomType: 'tutorial_room' as const, equipment: ['projector', 'whiteboard'] },
  { name: 'Room A-202', building: 'Building A', capacity: 50, roomType: 'tutorial_room' as const, equipment: ['projector', 'whiteboard'] },
  { name: 'Room B-101', building: 'Building B', capacity: 55, roomType: 'tutorial_room' as const, equipment: ['projector', 'whiteboard'] },
  { name: 'Room B-102', building: 'Building B', capacity: 40, roomType: 'tutorial_room' as const, equipment: ['whiteboard'] },
  { name: 'Room C-201', building: 'Building C', capacity: 45, roomType: 'tutorial_room' as const, equipment: ['projector', 'whiteboard'] },
  { name: 'Room C-202', building: 'Building C', capacity: 35, roomType: 'tutorial_room' as const, equipment: ['whiteboard'] },
  // Labs
  { name: 'Lab A-301', building: 'Building A', capacity: 40, roomType: 'lab' as const, equipment: ['lab_equipment', 'projector'] },
  { name: 'Lab B-301', building: 'Building B', capacity: 35, roomType: 'lab' as const, equipment: ['lab_equipment', 'projector', 'whiteboard'] },
  { name: 'Lab C-301', building: 'Building C', capacity: 30, roomType: 'lab' as const, equipment: ['lab_equipment'] },
  // Computer labs
  { name: 'CompLab A-401', building: 'Building A', capacity: 40, roomType: 'computer_lab' as const, equipment: ['computers', 'projector', 'whiteboard'] },
  { name: 'CompLab B-401', building: 'Building B', capacity: 35, roomType: 'computer_lab' as const, equipment: ['computers', 'projector'] },
  // Seminar rooms
  { name: 'Seminar D-101', building: 'Building D', capacity: 30, roomType: 'seminar_room' as const, equipment: ['projector', 'whiteboard'] },
  { name: 'Seminar D-102', building: 'Building D', capacity: 25, roomType: 'seminar_room' as const, equipment: ['projector'] },
];

// ── Student groups (12): 4 years × 3 groups ───────────────────────────
// Indices 0-2  → Year 1 (A, B, C)
// Indices 3-5  → Year 2 (A, B, C)
// Indices 6-8  → Year 3 (A, B, C)
// Indices 9-11 → Year 4 (A, B, C)
const STUDENT_GROUPS_DATA = [
  { name: 'Year 1 - Group A', year: 1, size: 45 },
  { name: 'Year 1 - Group B', year: 1, size: 42 },
  { name: 'Year 1 - Group C', year: 1, size: 38 },
  { name: 'Year 2 - Group A', year: 2, size: 37 },
  { name: 'Year 2 - Group B', year: 2, size: 35 },
  { name: 'Year 2 - Group C', year: 2, size: 32 },
  { name: 'Year 3 - Group A', year: 3, size: 30 },
  { name: 'Year 3 - Group B', year: 3, size: 28 },
  { name: 'Year 3 - Group C', year: 3, size: 26 },
  { name: 'Year 4 - Group A', year: 4, size: 24 },
  { name: 'Year 4 - Group B', year: 4, size: 22 },
  { name: 'Year 4 - Group C', year: 4, size: 20 },
];

// ── Courses (70) ───────────────────────────────────────────────────────
// sessionDef: { type, duration (slots), freq (per week) }
// lecturerBlock: which block of 5 lecturers owns this dept (0-9)
// yearGroups: which year-group indices (0-11) are enrolled
// extraGroups: additional group indices for cross-year courses (optional)

type SessionDef = { type: 'lecture' | 'tutorial' | 'lab'; duration: number; freq: number };
type CourseDef = {
  code: string;
  name: string;
  department: string;
  credits: number;
  lecturerBlock: number; // which block of 5 lecturers (0-9) teaches this
  yearGroups: number[];  // student group indices assigned to this course
  sessions: SessionDef[];
};

const COURSES_DATA: CourseDef[] = [
  // ── Computer Science (lecturerBlock 0, lecturers idx 0-4) ──────────
  // Each course assigned to exactly 1 group, round-robin within year level.
  // Y1=[0,1,2], Y2=[3,4,5], Y3=[6,7,8], Y4=[9,10,11]. ~5-6 courses per group.
  { code: 'CS101', name: 'Introduction to Computer Science', department: 'Computer Science', credits: 3, lecturerBlock: 0, yearGroups: [0],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'CS102', name: 'Programming Fundamentals', department: 'Computer Science', credits: 3, lecturerBlock: 0, yearGroups: [1],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'CS103', name: 'Discrete Mathematics for CS', department: 'Computer Science', credits: 3, lecturerBlock: 0, yearGroups: [2],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'CS201', name: 'Data Structures & Algorithms', department: 'Computer Science', credits: 4, lecturerBlock: 0, yearGroups: [3],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'CS202', name: 'Object-Oriented Programming', department: 'Computer Science', credits: 3, lecturerBlock: 0, yearGroups: [4],
    sessions: [{ type: 'lecture', duration: 1, freq: 3 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'CS203', name: 'Computer Architecture', department: 'Computer Science', credits: 3, lecturerBlock: 0, yearGroups: [5],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'CS301', name: 'Database Systems', department: 'Computer Science', credits: 3, lecturerBlock: 0, yearGroups: [6],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'CS302', name: 'Operating Systems', department: 'Computer Science', credits: 3, lecturerBlock: 0, yearGroups: [7],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'CS303', name: 'Computer Networks', department: 'Computer Science', credits: 3, lecturerBlock: 0, yearGroups: [8],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'CS401', name: 'Artificial Intelligence', department: 'Computer Science', credits: 4, lecturerBlock: 0, yearGroups: [9],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'CS402', name: 'Machine Learning', department: 'Computer Science', credits: 4, lecturerBlock: 0, yearGroups: [10],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'lab', duration: 3, freq: 1 }] },
  { code: 'CS403', name: 'Software Engineering', department: 'Computer Science', credits: 3, lecturerBlock: 0, yearGroups: [11],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 2 }] },
  // ── Mathematics (lecturerBlock 1, lecturers idx 5-9) ──────────────
  { code: 'MATH101', name: 'Calculus I', department: 'Mathematics', credits: 4, lecturerBlock: 1, yearGroups: [0],
    sessions: [{ type: 'lecture', duration: 2, freq: 3 }, { type: 'tutorial', duration: 1, freq: 2 }] },
  { code: 'MATH102', name: 'Calculus II', department: 'Mathematics', credits: 4, lecturerBlock: 1, yearGroups: [1],
    sessions: [{ type: 'lecture', duration: 2, freq: 3 }, { type: 'tutorial', duration: 1, freq: 2 }] },
  { code: 'MATH201', name: 'Linear Algebra', department: 'Mathematics', credits: 3, lecturerBlock: 1, yearGroups: [3],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'MATH202', name: 'Differential Equations', department: 'Mathematics', credits: 3, lecturerBlock: 1, yearGroups: [4],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'MATH301', name: 'Probability & Statistics', department: 'Mathematics', credits: 3, lecturerBlock: 1, yearGroups: [6],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'MATH302', name: 'Abstract Algebra', department: 'Mathematics', credits: 3, lecturerBlock: 1, yearGroups: [7],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'MATH401', name: 'Real Analysis', department: 'Mathematics', credits: 4, lecturerBlock: 1, yearGroups: [9],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 2 }] },
  // ── Physics (lecturerBlock 2, lecturers idx 10-14) ─────────────────
  { code: 'PHY101', name: 'Physics I - Mechanics', department: 'Physics', credits: 4, lecturerBlock: 2, yearGroups: [2],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'PHY102', name: 'Physics II - Thermodynamics', department: 'Physics', credits: 4, lecturerBlock: 2, yearGroups: [0],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'PHY201', name: 'Electromagnetism', department: 'Physics', credits: 4, lecturerBlock: 2, yearGroups: [5],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'PHY202', name: 'Optics & Waves', department: 'Physics', credits: 3, lecturerBlock: 2, yearGroups: [3],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'PHY301', name: 'Quantum Mechanics', department: 'Physics', credits: 4, lecturerBlock: 2, yearGroups: [8],
    sessions: [{ type: 'lecture', duration: 2, freq: 3 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'PHY302', name: 'Solid State Physics', department: 'Physics', credits: 3, lecturerBlock: 2, yearGroups: [6],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },

  // ── Chemistry (lecturerBlock 3, lecturers idx 15-19) ──────────────
  { code: 'CHEM101', name: 'General Chemistry I', department: 'Chemistry', credits: 4, lecturerBlock: 3, yearGroups: [1],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'lab', duration: 3, freq: 1 }] },
  { code: 'CHEM102', name: 'General Chemistry II', department: 'Chemistry', credits: 4, lecturerBlock: 3, yearGroups: [2],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'lab', duration: 3, freq: 1 }] },
  { code: 'CHEM201', name: 'Organic Chemistry I', department: 'Chemistry', credits: 4, lecturerBlock: 3, yearGroups: [4],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }, { type: 'lab', duration: 3, freq: 1 }] },
  { code: 'CHEM202', name: 'Organic Chemistry II', department: 'Chemistry', credits: 4, lecturerBlock: 3, yearGroups: [5],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'lab', duration: 3, freq: 1 }] },
  { code: 'CHEM301', name: 'Physical Chemistry', department: 'Chemistry', credits: 4, lecturerBlock: 3, yearGroups: [7],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'CHEM401', name: 'Biochemistry', department: 'Chemistry', credits: 3, lecturerBlock: 3, yearGroups: [10],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'lab', duration: 2, freq: 1 }] },

  // ── Biology (lecturerBlock 4, lecturers idx 20-24) ─────────────────
  { code: 'BIO101', name: 'Introduction to Biology', department: 'Biology', credits: 4, lecturerBlock: 4, yearGroups: [0],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'BIO102', name: 'Cell Biology', department: 'Biology', credits: 4, lecturerBlock: 4, yearGroups: [1],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'BIO201', name: 'Genetics', department: 'Biology', credits: 3, lecturerBlock: 4, yearGroups: [3],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'BIO202', name: 'Microbiology', department: 'Biology', credits: 3, lecturerBlock: 4, yearGroups: [5],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'lab', duration: 3, freq: 1 }] },
  { code: 'BIO301', name: 'Ecology', department: 'Biology', credits: 3, lecturerBlock: 4, yearGroups: [8],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'BIO401', name: 'Molecular Biology', department: 'Biology', credits: 4, lecturerBlock: 4, yearGroups: [11],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'lab', duration: 3, freq: 1 }] },

  // ── Engineering (lecturerBlock 5, lecturers idx 25-29) ────────────
  { code: 'ENG101', name: 'Engineering Drawing', department: 'Engineering', credits: 2, lecturerBlock: 5, yearGroups: [2],
    sessions: [{ type: 'lecture', duration: 1, freq: 1 }, { type: 'lab', duration: 2, freq: 2 }] },
  { code: 'ENG102', name: 'Engineering Mathematics', department: 'Engineering', credits: 3, lecturerBlock: 5, yearGroups: [0],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 2 }] },
  { code: 'ENG201', name: 'Circuit Analysis', department: 'Engineering', credits: 3, lecturerBlock: 5, yearGroups: [4],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'ENG202', name: 'Thermodynamics & Heat Transfer', department: 'Engineering', credits: 3, lecturerBlock: 5, yearGroups: [5],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'ENG301', name: 'Structural Mechanics', department: 'Engineering', credits: 3, lecturerBlock: 5, yearGroups: [6],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }, { type: 'lab', duration: 2, freq: 1 }] },
  { code: 'ENG401', name: 'Capstone Design Project', department: 'Engineering', credits: 4, lecturerBlock: 5, yearGroups: [9],
    sessions: [{ type: 'lecture', duration: 1, freq: 1 }, { type: 'lab', duration: 3, freq: 2 }] },

  // ── Economics (lecturerBlock 6, lecturers idx 30-34) ──────────────
  { code: 'ECON101', name: 'Introduction to Microeconomics', department: 'Economics', credits: 3, lecturerBlock: 6, yearGroups: [1],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'ECON102', name: 'Introduction to Macroeconomics', department: 'Economics', credits: 3, lecturerBlock: 6, yearGroups: [2],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'ECON201', name: 'Intermediate Microeconomics', department: 'Economics', credits: 3, lecturerBlock: 6, yearGroups: [3],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'ECON202', name: 'Econometrics I', department: 'Economics', credits: 3, lecturerBlock: 6, yearGroups: [5],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'ECON301', name: 'Public Economics', department: 'Economics', credits: 3, lecturerBlock: 6, yearGroups: [7],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'ECON401', name: 'International Trade Theory', department: 'Economics', credits: 3, lecturerBlock: 6, yearGroups: [10],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'ECON402', name: 'Development Economics', department: 'Economics', credits: 3, lecturerBlock: 6, yearGroups: [11],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },

  // ── Business (lecturerBlock 7, lecturers idx 35-39) ───────────────
  { code: 'BUS101', name: 'Principles of Management', department: 'Business', credits: 3, lecturerBlock: 7, yearGroups: [2],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'BUS102', name: 'Business Communication', department: 'Business', credits: 2, lecturerBlock: 7, yearGroups: [0],
    sessions: [{ type: 'lecture', duration: 1, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'BUS201', name: 'Financial Accounting', department: 'Business', credits: 3, lecturerBlock: 7, yearGroups: [4],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'BUS202', name: 'Marketing Fundamentals', department: 'Business', credits: 3, lecturerBlock: 7, yearGroups: [3],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'BUS301', name: 'Strategic Management', department: 'Business', credits: 3, lecturerBlock: 7, yearGroups: [8],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'BUS401', name: 'Entrepreneurship & Innovation', department: 'Business', credits: 3, lecturerBlock: 7, yearGroups: [9],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'BUS402', name: 'Corporate Finance', department: 'Business', credits: 3, lecturerBlock: 7, yearGroups: [11],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },

  // ── Literature (lecturerBlock 8, lecturers idx 40-44) ─────────────
  { code: 'LIT101', name: 'Introduction to World Literature', department: 'Literature', credits: 3, lecturerBlock: 8, yearGroups: [1],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'LIT102', name: 'Academic Writing', department: 'Literature', credits: 2, lecturerBlock: 8, yearGroups: [2],
    sessions: [{ type: 'lecture', duration: 1, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'LIT201', name: 'British Literature', department: 'Literature', credits: 3, lecturerBlock: 8, yearGroups: [5],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'LIT202', name: 'Comparative Literature', department: 'Literature', credits: 3, lecturerBlock: 8, yearGroups: [3],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'LIT301', name: 'Contemporary Fiction', department: 'Literature', credits: 3, lecturerBlock: 8, yearGroups: [7],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'LIT401', name: 'Literary Theory & Criticism', department: 'Literature', credits: 4, lecturerBlock: 8, yearGroups: [10],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 2 }] },

  // ── Psychology (lecturerBlock 9, lecturers idx 45-49) ─────────────
  { code: 'PSY101', name: 'Introduction to Psychology', department: 'Psychology', credits: 3, lecturerBlock: 9, yearGroups: [0],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'PSY102', name: 'Research Methods in Psychology', department: 'Psychology', credits: 3, lecturerBlock: 9, yearGroups: [1],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'PSY201', name: 'Cognitive Psychology', department: 'Psychology', credits: 3, lecturerBlock: 9, yearGroups: [4],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'PSY202', name: 'Developmental Psychology', department: 'Psychology', credits: 3, lecturerBlock: 9, yearGroups: [5],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'PSY301', name: 'Social Psychology', department: 'Psychology', credits: 3, lecturerBlock: 9, yearGroups: [8],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'PSY302', name: 'Abnormal Psychology', department: 'Psychology', credits: 3, lecturerBlock: 9, yearGroups: [6],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
  { code: 'PSY401', name: 'Neuropsychology', department: 'Psychology', credits: 4, lecturerBlock: 9, yearGroups: [11],
    sessions: [{ type: 'lecture', duration: 2, freq: 2 }, { type: 'tutorial', duration: 1, freq: 1 }] },
];

// ── Default scheduling constraints ────────────────────────────────────
const CONSTRAINTS_DATA = [
  {
    constraintType: 'lecturer_no_double_booking',
    severity: 'hard' as const,
    weight: 1000,
    config: '{}',
    description: 'A lecturer cannot teach two sessions at the same time',
  },
  {
    constraintType: 'room_no_double_booking',
    severity: 'hard' as const,
    weight: 1000,
    config: '{}',
    description: 'A room cannot host two sessions at the same time',
  },
  {
    constraintType: 'student_group_no_double_booking',
    severity: 'hard' as const,
    weight: 1000,
    config: '{}',
    description: 'A student group cannot attend two sessions at the same time',
  },
  {
    constraintType: 'room_capacity',
    severity: 'hard' as const,
    weight: 1000,
    config: '{}',
    description: 'Room capacity must not be exceeded by the enrolled student group sizes',
  },
  {
    constraintType: 'lecturer_availability',
    severity: 'hard' as const,
    weight: 1000,
    config: '{}',
    description: 'Sessions must not be scheduled on dates/days a lecturer is marked unavailable',
  },
  {
    constraintType: 'room_type_match',
    severity: 'soft' as const,
    weight: 50,
    config: '{}',
    description: 'Assign labs to lab rooms and lectures to lecture halls where possible',
  },
  {
    constraintType: 'minimize_lecturer_gaps',
    severity: 'soft' as const,
    weight: 30,
    config: '{}',
    description: 'Minimize idle gaps between a lecturer\'s sessions on the same day',
  },
  {
    constraintType: 'minimize_student_gaps',
    severity: 'soft' as const,
    weight: 20,
    config: '{}',
    description: 'Minimize idle gaps between a student group\'s sessions on the same day',
  },
  {
    constraintType: 'distribute_load_evenly',
    severity: 'soft' as const,
    weight: 40,
    config: '{}',
    description: 'Spread repeated sessions for the same course across different days of the week',
  },
  {
    constraintType: 'respect_lecturer_time_preference',
    severity: 'soft' as const,
    weight: 20,
    config: '{}',
    description: 'Respect lecturer preferred time slot preferences where possible',
  },
];

// ── Wipe existing tenant data ───────────────────────────────────────
async function wipeTenantData(tenantId: string) {
  console.log('Clearing existing data...');

  // Delete in dependency order (children first)
  // 1. Lecturer exceptions (child of users)
  const tenantUserIds = (
    await db.select({ id: users.id }).from(users).where(eq(users.tenantId, tenantId))
  ).map((u) => u.id);

  if (tenantUserIds.length > 0) {
    await db.delete(lecturerDateExceptions).where(inArray(lecturerDateExceptions.userId, tenantUserIds));
    await db.delete(lecturerDayExceptions).where(inArray(lecturerDayExceptions.userId, tenantUserIds));
  }

  // 2. Session lecturers & course student groups (children of courses → sessions)
  const tenantCourseIds = (
    await db.select({ id: courses.id }).from(courses).where(eq(courses.tenantId, tenantId))
  ).map((c) => c.id);

  if (tenantCourseIds.length > 0) {
    const tenantSessionIds = (
      await db
        .select({ id: courseSessions.id })
        .from(courseSessions)
        .where(inArray(courseSessions.courseId, tenantCourseIds))
    ).map((s) => s.id);

    if (tenantSessionIds.length > 0) {
      await db.delete(sessionLecturers).where(inArray(sessionLecturers.sessionId, tenantSessionIds));
    }

    await db.delete(courseStudentGroups).where(inArray(courseStudentGroups.courseId, tenantCourseIds));
    await db.delete(courseLecturers).where(inArray(courseLecturers.courseId, tenantCourseIds));
    await db.delete(courseSessions).where(inArray(courseSessions.courseId, tenantCourseIds));
  }

  // 3. Schedules (schedule_entries cascade from generated_schedules)
  await db.delete(generatedSchedules).where(eq(generatedSchedules.tenantId, tenantId));

  // 4. Top-level tenant-scoped tables
  await db.delete(courses).where(eq(courses.tenantId, tenantId));
  await db.delete(rooms).where(eq(rooms.tenantId, tenantId));
  await db.delete(studentGroups).where(eq(studentGroups.tenantId, tenantId));
  await db.delete(timeSlots).where(eq(timeSlots.tenantId, tenantId));
  await db.delete(schedulingConstraints).where(eq(schedulingConstraints.tenantId, tenantId));

  // 5. Delete seeded lecturer users (clerkUserId = '') but keep real users
  await db.delete(users).where(and(eq(users.tenantId, tenantId), eq(users.clerkUserId, '')));

  console.log('  -> All existing data cleared\n');
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  // Fetch all tenants
  const allTenants = await db
    .select({ id: tenants.id, name: tenants.name, slug: tenants.slug, status: tenants.status })
    .from(tenants);

  if (allTenants.length === 0) {
    console.log('No tenants found. Sign in to the app first to create one.');
    await sql.end();
    process.exit(1);
  }

  // Show numbered list
  console.log('\nAvailable tenants:\n');
  allTenants.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.name} (${t.slug})`);
  });

  // Ask user to pick
  const answer = await prompt(`\nChoose a tenant (1-${allTenants.length}): `);
  const choice = parseInt(answer, 10);

  if (isNaN(choice) || choice < 1 || choice > allTenants.length) {
    console.error('Invalid choice.');
    await sql.end();
    process.exit(1);
  }

  const tenant = allTenants[choice - 1]!;

  // Confirm wipe + seed
  const confirm = await prompt(
    `\nThis will DELETE all existing data in "${tenant.name}" and replace it with seed data.\nType "yes" to continue: `,
  );

  if (confirm.toLowerCase() !== 'yes') {
    console.log('Cancelled.');
    await sql.end();
    return;
  }

  console.log(`\nSeeding: ${tenant.name}\n`);

  // Wipe existing data
  await wipeTenantData(tenant.id);

  // 1. Create lecturers (50)
  console.log(`Creating ${LECTURERS.length} lecturers...`);
  const createdLecturers = await db
    .insert(users)
    .values(
      LECTURERS.map((l, i) => ({
        tenantId: tenant.id,
        clerkUserId: '',
        email: `lecturer${i + 1}@seed.local`,
        firstName: l.firstName,
        lastName: l.lastName,
        role: 'lecturer' as const,
      })),
    )
    .returning();
  console.log(`  -> ${createdLecturers.length} lecturers created`);

  // 2. Create rooms
  console.log(`Creating ${ROOMS_DATA.length} rooms...`);
  const createdRooms = await db
    .insert(rooms)
    .values(
      ROOMS_DATA.map((r) => ({
        tenantId: tenant.id,
        name: r.name,
        building: r.building,
        capacity: r.capacity,
        roomType: r.roomType,
        equipment: r.equipment,
      })),
    )
    .returning();
  console.log(`  -> ${createdRooms.length} rooms created`);

  // 3. Create student groups (12)
  console.log(`Creating ${STUDENT_GROUPS_DATA.length} student groups...`);
  const createdGroups = await db
    .insert(studentGroups)
    .values(
      STUDENT_GROUPS_DATA.map((sg) => ({
        tenantId: tenant.id,
        name: sg.name,
        year: sg.year,
        size: sg.size,
      })),
    )
    .returning();
  console.log(`  -> ${createdGroups.length} student groups created`);

  // 4. Create courses + sessions + lecturer assignments + student group assignments (70 courses)
  console.log(`Creating ${COURSES_DATA.length} courses with sessions...`);
  let totalSessions = 0;
  let totalCourseLecturers = 0;
  let totalSessionLecturers = 0;
  let totalCourseStudentGroups = 0;

  for (let courseIdx = 0; courseIdx < COURSES_DATA.length; courseIdx++) {
    const courseData = COURSES_DATA[courseIdx]!;

    // Insert course
    const [course] = await db
      .insert(courses)
      .values({
        tenantId: tenant.id,
        code: courseData.code,
        name: courseData.name,
        department: courseData.department,
        credits: courseData.credits,
      })
      .returning();

    if (!course) continue;

    // Insert sessions
    const createdSessions = await db
      .insert(courseSessions)
      .values(
        courseData.sessions.map((s) => ({
          courseId: course.id,
          sessionType: s.type,
          durationSlots: s.duration,
          frequencyPerWeek: s.freq,
        })),
      )
      .returning();
    totalSessions += createdSessions.length;

    // Determine which lecturers teach this course.
    // The "primary" lecturer is the first in the dept block; secondary is offset by courseIdx within block.
    const blockStart = courseData.lecturerBlock * 5;
    const primaryIdx = blockStart + (courseIdx % 5);
    const secondaryIdx = blockStart + ((courseIdx + 1) % 5);
    const primaryLecturer = createdLecturers[primaryIdx];
    const secondaryLecturer = createdLecturers[secondaryIdx];

    // Course-level lecturer assignment (primary only as course coordinator)
    if (primaryLecturer) {
      await db.insert(courseLecturers).values({
        courseId: course.id,
        userId: primaryLecturer.id,
      });
      totalCourseLecturers += 1;
    }

    // Session-level lecturer assignments
    for (const session of createdSessions) {
      const sessionLecturerValues: Array<{ sessionId: string; userId: string }> = [];

      if (primaryLecturer) {
        sessionLecturerValues.push({ sessionId: session.id, userId: primaryLecturer.id });
      }
      // Tutorials and labs get a second lecturer (the secondary in the block)
      if (
        (session.sessionType === 'tutorial' || session.sessionType === 'lab') &&
        secondaryLecturer &&
        secondaryLecturer.id !== primaryLecturer?.id
      ) {
        sessionLecturerValues.push({ sessionId: session.id, userId: secondaryLecturer.id });
      }

      if (sessionLecturerValues.length > 0) {
        await db.insert(sessionLecturers).values(sessionLecturerValues);
        totalSessionLecturers += sessionLecturerValues.length;
      }
    }

    // Course-student group assignments
    if (courseData.yearGroups.length > 0) {
      const sgValues = courseData.yearGroups
        .map((groupIdx) => {
          const group = createdGroups[groupIdx];
          return group ? { courseId: course.id, studentGroupId: group.id } : null;
        })
        .filter((v): v is { courseId: string; studentGroupId: string } => v !== null);

      if (sgValues.length > 0) {
        await db.insert(courseStudentGroups).values(sgValues);
        totalCourseStudentGroups += sgValues.length;
      }
    }
  }

  console.log(`  -> ${COURSES_DATA.length} courses, ${totalSessions} sessions`);
  console.log(`  -> ${totalCourseLecturers} course-lecturer links, ${totalSessionLecturers} session-lecturer links`);
  console.log(`  -> ${totalCourseStudentGroups} course-student-group links`);

  // 5. Generate time slots (Mon-Fri, 08:00-18:00, 1-hour slots, ~17 weeks)
  console.log('Generating time slots (2026-04-13 → 2026-08-07, Mon-Fri, 08:00-18:00, 1h each)...');
  const startDate = '2026-04-13';
  const endDate = '2026-08-07';
  const activeDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

  type DayOfWeekValue = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

  const slotValues: Array<{
    tenantId: string;
    date: string;
    dayOfWeek: DayOfWeekValue;
    startTime: string;
    endTime: string;
  }> = [];

  const current = new Date(startDate + 'T12:00:00Z');
  const end = new Date(endDate + 'T12:00:00Z');

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0]!;
    const dow = getDayOfWeek(dateStr);

    if (activeDays.includes(dow)) {
      for (let hour = 8; hour < 18; hour++) {
        const startTime = `${String(hour).padStart(2, '0')}:00`;
        const endTime = `${String(hour + 1).padStart(2, '0')}:00`;
        slotValues.push({
          tenantId: tenant.id,
          date: dateStr,
          dayOfWeek: dow as DayOfWeekValue,
          startTime,
          endTime,
        });
      }
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  const BATCH_SIZE = 500;
  for (let i = 0; i < slotValues.length; i += BATCH_SIZE) {
    await db.insert(timeSlots).values(slotValues.slice(i, i + BATCH_SIZE));
  }
  console.log(`  -> ${slotValues.length} time slots created`);

  // 6. Lecturer unavailability exceptions
  // Day exceptions: 15 lecturers each get one recurring day off.
  // Deterministically cycle through weekdays using lecturer index.
  console.log('Adding lecturer unavailability exceptions...');
  const unavailDays: DayOfWeekValue[] = ['friday', 'monday', 'wednesday', 'thursday', 'tuesday'];
  const dayExceptionTargets = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42];

  const dayExceptionsData = dayExceptionTargets.map((lecturerIdx, i) => {
    const lecturer = createdLecturers[lecturerIdx];
    return lecturer
      ? { userId: lecturer.id, dayOfWeek: pick(unavailDays, i) }
      : null;
  }).filter((v): v is { userId: string; dayOfWeek: DayOfWeekValue } => v !== null);

  if (dayExceptionsData.length > 0) {
    await db.insert(lecturerDayExceptions).values(dayExceptionsData);
  }

  // Date exceptions: 10 lecturers get 2-5 date exceptions each within the semester period.
  // Use fixed offsets from startDate to keep it deterministic.
  // Pattern: lecturer at index picks dates based on their position.
  type DateException = { userId: string; date: string; reason: string };
  const dateExceptionTargets = [1, 5, 10, 16, 20, 25, 31, 37, 43, 47];

  const conferenceReasons = [
    'Conference - International Symposium',
    'Conference - Research Workshop',
    'Academic Conference - Keynote Speaker',
    'Professional Development Day',
    'External Examination Duty',
    'Medical Appointment',
    'Workshop - Curriculum Development',
    'Faculty Senate Retreat',
    'Grant Review Panel',
    'Visiting Scholar Duties',
  ];

  // Pre-compute dates within the semester spread across ~17 weeks (119 calendar days).
  // Offsets (in days from start) chosen to be spread out and fall on weekdays.
  // 17 weeks × 5 weekdays = 85 weekdays total; pick 5 offsets per lecturer spread through the calendar.
  const dateOffsetSets: number[][] = [
    [7, 21, 56, 84, 105],   // lecturer 1
    [14, 35, 63, 91, 112],  // lecturer 5
    [3, 28, 49, 77, 98],    // lecturer 10
    [10, 42, 70, 88, 115],  // lecturer 16
    [5, 19, 58, 80, 107],   // lecturer 20
    [17, 33, 52, 86, 109],  // lecturer 25
    [8, 26, 61, 93, 118],   // lecturer 31
    [12, 38, 67, 95, 113],  // lecturer 37
    [4, 23, 55, 82, 103],   // lecturer 43
    [15, 30, 44, 71, 99],   // lecturer 47
  ];

  const seedStart = new Date(startDate + 'T12:00:00Z');
  const dateExceptionsData: DateException[] = [];

  dateExceptionTargets.forEach((lecturerIdx, i) => {
    const lecturer = createdLecturers[lecturerIdx];
    if (!lecturer) return;
    const offsets = dateOffsetSets[i] ?? [];
    const reason = conferenceReasons[i % conferenceReasons.length]!;
    offsets.forEach((offset) => {
      const d = new Date(seedStart);
      d.setUTCDate(d.getUTCDate() + offset);
      const dateStr = d.toISOString().split('T')[0]!;
      const dow = getDayOfWeek(dateStr);
      // Only add if it falls on a weekday (skip weekends)
      if (activeDays.includes(dow)) {
        dateExceptionsData.push({ userId: lecturer.id, date: dateStr, reason });
      }
    });
  });

  if (dateExceptionsData.length > 0) {
    await db.insert(lecturerDateExceptions).values(dateExceptionsData);
  }

  console.log(`  -> ${dayExceptionsData.length} day exceptions, ${dateExceptionsData.length} date exceptions`);

  // 7. Scheduling constraints
  console.log('Creating scheduling constraints...');
  const createdConstraints = await db
    .insert(schedulingConstraints)
    .values(
      CONSTRAINTS_DATA.map((c) => ({
        tenantId: tenant.id,
        constraintType: c.constraintType,
        severity: c.severity,
        weight: c.weight,
        config: c.config,
        description: c.description,
      })),
    )
    .returning();
  console.log(`  -> ${createdConstraints.length} constraints created`);

  // ── Summary ─────────────────────────────────────────────────────
  const hardConstraints = createdConstraints.filter((c) => c.severity === 'hard').length;
  const softConstraints = createdConstraints.filter((c) => c.severity === 'soft').length;

  console.log('\n--- Seed Complete ---');
  console.log(`Tenant:              ${tenant.name}`);
  console.log(`Lecturers:           ${createdLecturers.length}`);
  console.log(`Rooms:               ${createdRooms.length}`);
  console.log(`Student Groups:      ${createdGroups.length}`);
  console.log(`Courses:             ${COURSES_DATA.length}`);
  console.log(`Sessions:            ${totalSessions}`);
  console.log(`Course-Lecturer:     ${totalCourseLecturers}`);
  console.log(`Session-Lecturer:    ${totalSessionLecturers}`);
  console.log(`Course-StudentGroup: ${totalCourseStudentGroups}`);
  console.log(`Time Slots:          ${slotValues.length}`);
  console.log(`Day Exceptions:      ${dayExceptionsData.length}`);
  console.log(`Date Exceptions:     ${dateExceptionsData.length}`);
  console.log(`Constraints:         ${hardConstraints} hard, ${softConstraints} soft`);
  console.log('');

  await sql.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
