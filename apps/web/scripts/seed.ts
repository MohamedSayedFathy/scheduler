/**
 * Seed script — populates the database with the real TUM university dataset.
 *
 * Usage:
 *   cd apps/web
 *   npx dotenv-cli -e .env.local -- npx tsx scripts/seed.ts
 *
 * Dataset size:
 *   - 21 lecturers (extracted from timetable photos)
 *   - ~45 courses across Informatics (Sem 2/4/6) and Management
 *   - 4 student groups with fixed colors
 *   - 13 rooms
 *   - ~17 weeks of time slots (2026-04-13 → 2026-08-07), Mon-Fri, 6 × 1.5h slots
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
 * 21 lecturers extracted from the timetable photos.
 * Email = {surname-lowercase}@tum.de, clerkUserId = '' (seeded placeholder).
 */
const LECTURERS = [
  { firstName: 'Wuttke',       lastName: 'Wuttke' },
  { firstName: 'Kobourov',     lastName: 'Kobourov' },
  { firstName: 'Chen',         lastName: 'Chen' },
  { firstName: 'Wagner',       lastName: 'Wagner' },
  { firstName: 'Acosta',       lastName: 'Acosta' },
  { firstName: 'Pufahl',       lastName: 'Pufahl' },
  { firstName: 'Müller',       lastName: 'Müller' },
  { firstName: 'Anzt',         lastName: 'Anzt' },
  { firstName: 'Meißner',      lastName: 'Meißner' },
  { firstName: 'Amr',          lastName: 'Amr' },
  { firstName: 'Günther',      lastName: 'Günther' },
  { firstName: 'Trinitis',     lastName: 'Trinitis' },
  { firstName: 'Luttenberger', lastName: 'Luttenberger' },
  { firstName: 'Sunyaev',      lastName: 'Sunyaev' },
  { firstName: 'Fraser',       lastName: 'Fraser' },
  { firstName: 'Tasch',        lastName: 'Tasch' },
  { firstName: 'Volkmer',      lastName: 'Volkmer' },
  { firstName: 'Li',           lastName: 'Li' },
  { firstName: 'Stich',        lastName: 'Stich' },
  { firstName: 'Samira',       lastName: 'Samira' },
  { firstName: 'Kerstin',      lastName: 'Kerstin' },
];

// Lookup map: surname → index in LECTURERS
const L: Record<string, number> = {};
LECTURERS.forEach((l, i) => { L[l.lastName] = i; });

// ── Rooms (13) ────────────────────────────────────────────────────────
const ROOMS_DATA = [
  // Lecture halls
  { name: 'D.2.01',            building: 'Main',        capacity: 200, roomType: 'lecture_hall'  as const, equipment: ['projector', 'microphone', 'whiteboard'] },
  { name: 'D.2.11',            building: 'Main',        capacity: 200, roomType: 'lecture_hall'  as const, equipment: ['projector', 'microphone', 'whiteboard'] },
  { name: 'L.0.13',            building: 'Main',        capacity: 200, roomType: 'lecture_hall'  as const, equipment: ['projector', 'microphone'] },
  { name: 'C.0.50',            building: 'Main',        capacity: 200, roomType: 'lecture_hall'  as const, equipment: ['projector', 'microphone', 'whiteboard'] },
  { name: 'Weipertstr. C.0.50',building: 'Main',        capacity: 200, roomType: 'lecture_hall'  as const, equipment: ['projector', 'microphone'] },
  // Tutorial rooms
  { name: 'B.0.22',            building: 'Main',        capacity: 200, roomType: 'tutorial_room' as const, equipment: ['projector', 'whiteboard'] },
  { name: 'B.0.23',            building: 'Main',        capacity: 200, roomType: 'tutorial_room' as const, equipment: ['projector', 'whiteboard'] },
  { name: 'B.0.43',            building: 'Main',        capacity: 200, roomType: 'tutorial_room' as const, equipment: ['whiteboard'] },
  { name: 'B.0.44',            building: 'Main',        capacity: 200, roomType: 'tutorial_room' as const, equipment: ['whiteboard'] },
  { name: 'Weipertstr. B.0.22',building: 'Main',        capacity: 200, roomType: 'tutorial_room' as const, equipment: ['projector', 'whiteboard'] },
  { name: 'C.0.45',            building: 'Main',        capacity: 200, roomType: 'tutorial_room' as const, equipment: ['projector', 'whiteboard'] },
  // Seminar rooms
  { name: 'Etzelstraße 1',     building: 'Etzelstraße', capacity: 200, roomType: 'seminar_room'  as const, equipment: ['projector', 'whiteboard'] },
  { name: 'Etzelstraße 2',     building: 'Etzelstraße', capacity: 200, roomType: 'seminar_room'  as const, equipment: ['projector', 'whiteboard'] },
];

// ── Student groups (4) ─────────────────────────────────────────────────
const STUDENT_GROUPS_DATA = [
  { name: 'Sem 2 Informatics', year: 2, size: 60, color: '#3B82F6' },
  { name: 'Sem 4 Informatics', year: 4, size: 50, color: '#22C55E' },
  { name: 'Sem 6 Informatics', year: 6, size: 40, color: '#F97316' },
  { name: 'Management (MGT)',  year: 2, size: 40, color: '#1F2937' },
];

// Group index constants for readability
const GRP_SEM2 = 0; // Sem 2 Informatics – blue
const GRP_SEM4 = 1; // Sem 4 Informatics – green
const GRP_SEM6 = 2; // Sem 6 Informatics – orange
const GRP_MGT  = 3; // Management – black

// ── Courses (~45) ─────────────────────────────────────────────────────
// lecturerIndices: indices into LECTURERS array (all of them teach this course at session level)
// lecturerIndices[0] is the primary (used as course coordinator in courseLecturers)
// yearGroups: which student group indices attend this course

type SessionDef = { type: 'lecture' | 'tutorial' | 'lab'; duration: number; freq: number };
type CourseDef = {
  code: string;
  name: string;
  department: string;
  credits: number;
  lecturerIndices: number[];
  yearGroups: number[];
  sessions: SessionDef[];
};

const COURSES_DATA: CourseDef[] = [
  // ── Sem 2 Informatics (Blue) ──────────────────────────────────────
  {
    code: 'INF201', name: 'Fundamentals of Algorithms and Data Structures',
    department: 'Informatics', credits: 6,
    lecturerIndices: [L['Kobourov']!],
    yearGroups: [GRP_SEM2],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 2 },
      { type: 'tutorial', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF202', name: 'Operating Systems and System Software',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Trinitis']!],
    yearGroups: [GRP_SEM2],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 1 },
      { type: 'tutorial', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF203', name: 'Linear Algebra',
    department: 'Mathematics', credits: 6,
    lecturerIndices: [L['Anzt']!],
    yearGroups: [GRP_SEM2],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 2 },
      { type: 'tutorial', duration: 1, freq: 2 },
    ],
  },
  {
    code: 'INF204', name: 'Foundations of Cyber-Physical Systems',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Amr']!],
    yearGroups: [GRP_SEM2],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 1 },
      { type: 'tutorial', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF205', name: 'Introduction to Software Engineering',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Wagner']!],
    yearGroups: [GRP_SEM2],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 1 },
      { type: 'tutorial', duration: 1, freq: 1 },
    ],
  },

  // ── Sem 4 Informatics (Green) ─────────────────────────────────────
  {
    code: 'INF401', name: 'Business Process Management',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Pufahl']!, L['Samira']!],
    yearGroups: [GRP_SEM4],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 1 },
      { type: 'tutorial', duration: 1, freq: 4 },
    ],
  },
  {
    code: 'INF402', name: 'Introduction to Signal Processing',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Amr']!],
    yearGroups: [GRP_SEM4],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 1 },
      { type: 'tutorial', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF403', name: 'Discrete Probability Theory',
    department: 'Mathematics', credits: 5,
    lecturerIndices: [L['Fraser']!],
    yearGroups: [GRP_SEM4],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 1 },
      { type: 'tutorial', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF404', name: 'Enterprise Architecture Management',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Pufahl']!, L['Kerstin']!],
    yearGroups: [GRP_SEM4],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 1 },
      { type: 'tutorial', duration: 1, freq: 4 },
    ],
  },

  // ── Sem 6 Informatics (Orange) ─────────────────────────────────────
  {
    code: 'INF601', name: 'Introduction to Data Visualization',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Kobourov']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 2 },
    ],
  },
  {
    code: 'INF602', name: 'Foundation and Application of Generative AI',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Chen']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 1 },
      { type: 'tutorial', duration: 1, freq: 3 },
    ],
  },
  {
    code: 'INF603', name: 'Algorithms for Graph Drawing',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Kobourov']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 2 },
    ],
  },
  {
    code: 'INF604', name: 'Algorithm Design for Competitive Challenges',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Kobourov']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF605', name: 'Network Visualization for Competitive Challenges',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Kobourov']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF606', name: 'Knowledge Graphs',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Acosta']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 1 },
      { type: 'tutorial', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF607', name: 'Games on Graphs',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Luttenberger']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 1 },
      { type: 'tutorial', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF608', name: 'Mathematical Foundation of Cryptography',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Luttenberger']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 1 },
      { type: 'tutorial', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF609', name: 'Advanced Software Testing and Analysis',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Wagner']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 1 },
      { type: 'tutorial', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF610', name: 'Computational Geometry',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Kobourov']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 2 },
    ],
  },
  {
    code: 'INF611', name: 'Introduction to C++',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Anzt']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 2 },
    ],
  },
  {
    code: 'INF612', name: 'Numerical Linear Algebra for Computational Science and IE',
    department: 'Mathematics', credits: 5,
    lecturerIndices: [L['Anzt']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 2 },
    ],
  },
  {
    code: 'INF613', name: 'Parallel Computing and Exercise',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Anzt']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 2, freq: 1 },
    ],
  },
  {
    code: 'INF614', name: 'Network Coding',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Günther']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 2 },
    ],
  },
  {
    code: 'INF615', name: 'Gamified Information Systems',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Sunyaev']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF616', name: 'Seminar: Advanced Topics High-Performance Computing',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Anzt']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF617', name: 'Seminar: Generative Models on Text',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Fraser']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF618', name: 'AI-augmented BPM',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Pufahl']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF619', name: 'PC: Building an Advanced BPM Research App',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Pufahl']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lab', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF620', name: 'Building a BPM Research App',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Pufahl']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF621', name: 'Hot Topics in BPM Research',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Pufahl']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF622', name: 'Computer Networking and Internet',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Günther']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF623', name: 'Security of Large Language Models',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Chen']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF624', name: 'Software Engineering for Artificial Intelligence',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Wagner']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF625', name: 'SE-Kolloquium: Software Engineering Research',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Wagner']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF626', name: 'Exploratory Software Testing',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Chen']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF627', name: 'AI-Empowered Automated Software Development',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Chen']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF628', name: 'History of Computer Science',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Trinitis']!, L['Luttenberger']!, L['Anzt']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF629', name: 'Exploring AI in Software Engineering',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Wagner']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF630', name: 'Data Engineering Group 1',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Acosta']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF631', name: 'Data Engineering Group 2',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Acosta']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF632', name: 'Duckie Town',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Amr']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lab', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF633', name: 'Next Gen Programming',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Wagner']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF634', name: 'Applied Machine Learning',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Amr']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF635', name: 'Human-centered Artifact Design',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Sunyaev']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF636', name: 'Automate Mobile App Testing',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Chen']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF637', name: 'BPC: Chatbot',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Tasch']!, L['Wagner']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF638', name: 'Projects in Natural Language Processing',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Fraser']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF639', name: 'Block: Tools and Practice in Digital Research and Engineering',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Anzt']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'INF640', name: 'Block: Disentangling Sustainability in IT',
    department: 'Informatics', credits: 3,
    lecturerIndices: [L['Pufahl']!],
    yearGroups: [GRP_SEM6],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },

  // ── Management / MGT (Black) ──────────────────────────────────────
  {
    code: 'MGT101', name: 'Production and Logistics',
    department: 'Management', credits: 5,
    lecturerIndices: [L['Wuttke']!],
    yearGroups: [GRP_MGT],
    sessions: [
      { type: 'lecture', duration: 1, freq: 2 },
    ],
  },
  {
    code: 'MGT102', name: 'Investment and Financial Management',
    department: 'Management', credits: 5,
    lecturerIndices: [L['Müller']!],
    yearGroups: [GRP_MGT],
    sessions: [
      { type: 'lecture',  duration: 1, freq: 1 },
      { type: 'tutorial', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'MGT103', name: 'High-Performance Computing',
    department: 'Informatics', credits: 5,
    lecturerIndices: [L['Anzt']!],
    yearGroups: [GRP_MGT],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'MGT104', name: 'Marketing and Innovation Management',
    department: 'Management', credits: 5,
    lecturerIndices: [L['Meißner']!],
    yearGroups: [GRP_MGT],
    sessions: [
      { type: 'lecture', duration: 1, freq: 2 },
    ],
  },
  {
    code: 'MGT201', name: 'Electives in Management: Social Media Marketing',
    department: 'Management', credits: 3,
    lecturerIndices: [L['Volkmer']!],
    yearGroups: [GRP_MGT],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'MGT202', name: 'Electives in Management: CEO Leadership Series',
    department: 'Management', credits: 3,
    lecturerIndices: [L['Li']!],
    yearGroups: [GRP_MGT],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'MGT301', name: 'Block: Ethics for Nerds',
    department: 'Management', credits: 3,
    lecturerIndices: [L['Trinitis']!],
    yearGroups: [GRP_MGT],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
  {
    code: 'MGT302', name: 'Block: Digital Responsibility for Information Engineering',
    department: 'Management', credits: 3,
    lecturerIndices: [L['Stich']!],
    yearGroups: [GRP_MGT],
    sessions: [
      { type: 'lecture', duration: 1, freq: 1 },
    ],
  },
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
    description: "Minimize idle gaps between a lecturer's sessions on the same day",
  },
  {
    constraintType: 'minimize_student_gaps',
    severity: 'soft' as const,
    weight: 20,
    config: '{}',
    description: "Minimize idle gaps between a student group's sessions on the same day",
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

  // 1. Create lecturers (21)
  console.log(`Creating ${LECTURERS.length} lecturers...`);
  const createdLecturers = await db
    .insert(users)
    .values(
      LECTURERS.map((l) => ({
        tenantId: tenant.id,
        clerkUserId: '',
        email: `${l.lastName.toLowerCase().replace(/[^a-z0-9]/g, '')}@tum.de`,
        firstName: l.firstName,
        lastName: l.lastName,
        role: 'lecturer' as const,
      })),
    )
    .returning();
  console.log(`  -> ${createdLecturers.length} lecturers created`);

  // 2. Create rooms (13)
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

  // 3. Create student groups (4) with colors
  console.log(`Creating ${STUDENT_GROUPS_DATA.length} student groups...`);
  const createdGroups = await db
    .insert(studentGroups)
    .values(
      STUDENT_GROUPS_DATA.map((sg) => ({
        tenantId: tenant.id,
        name: sg.name,
        year: sg.year,
        size: sg.size,
        color: sg.color,
      })),
    )
    .returning();
  console.log(`  -> ${createdGroups.length} student groups created`);

  // 4. Create courses + sessions + lecturer assignments + student group assignments
  console.log(`Creating ${COURSES_DATA.length} courses with sessions...`);
  let totalSessions = 0;
  let totalCourseLecturers = 0;
  let totalSessionLecturers = 0;
  let totalCourseStudentGroups = 0;

  for (const courseData of COURSES_DATA) {
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

    // Course-level lecturer assignment (primary only as course coordinator)
    const primaryIdx = courseData.lecturerIndices[0];
    const primaryLecturer = primaryIdx !== undefined ? createdLecturers[primaryIdx] : undefined;

    if (primaryLecturer) {
      await db.insert(courseLecturers).values({
        courseId: course.id,
        userId: primaryLecturer.id,
      });
      totalCourseLecturers += 1;
    }

    // Session-level lecturer assignments: all named lecturers on all sessions
    for (const session of createdSessions) {
      const sessionLecturerValues: Array<{ sessionId: string; userId: string }> = [];

      for (const lecIdx of courseData.lecturerIndices) {
        const lecturer = createdLecturers[lecIdx];
        if (lecturer) {
          sessionLecturerValues.push({ sessionId: session.id, userId: lecturer.id });
        }
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

  // 5. Generate time slots (Mon-Fri, 6 × 1.5h slots, ~17 weeks)
  console.log('Generating time slots (2026-04-13 → 2026-08-07, Mon-Fri, 6 × 1.5h slots)...');
  const startDate = '2026-04-13';
  const endDate = '2026-08-07';
  const activeDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

  // 6 fixed 1.5-hour slots per day (30-min breaks between)
  const SLOTS = [
    { startTime: '08:15', endTime: '09:45' },
    { startTime: '10:15', endTime: '11:45' },
    { startTime: '12:15', endTime: '13:45' },
    { startTime: '14:15', endTime: '15:45' },
    { startTime: '16:15', endTime: '17:45' },
    { startTime: '18:15', endTime: '19:45' },
  ];

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
      for (const slot of SLOTS) {
        slotValues.push({
          tenantId: tenant.id,
          date: dateStr,
          dayOfWeek: dow as DayOfWeekValue,
          startTime: slot.startTime,
          endTime: slot.endTime,
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
  // Day exceptions: every 4th lecturer (indices 0, 4, 8, 12, 16, 20) gets one recurring day off.
  console.log('Adding lecturer unavailability exceptions...');
  const unavailDays: DayOfWeekValue[] = ['friday', 'monday', 'wednesday', 'thursday', 'tuesday'];
  const dayExceptionTargets = [0, 4, 8, 12, 16, 20];

  const dayExceptionsData = dayExceptionTargets
    .map((lecturerIdx, i) => {
      const lecturer = createdLecturers[lecturerIdx];
      return lecturer
        ? { userId: lecturer.id, dayOfWeek: pick(unavailDays, i) }
        : null;
    })
    .filter((v): v is { userId: string; dayOfWeek: DayOfWeekValue } => v !== null);

  if (dayExceptionsData.length > 0) {
    await db.insert(lecturerDayExceptions).values(dayExceptionsData);
  }

  // Date exceptions: selected lecturers get 2-5 date exceptions within the semester.
  type DateException = { userId: string; date: string; reason: string };
  const dateExceptionTargets = [1, 5, 9, 13, 17];

  const conferenceReasons = [
    'Conference - International Symposium',
    'Conference - Research Workshop',
    'Academic Conference - Keynote Speaker',
    'Professional Development Day',
    'External Examination Duty',
  ];

  const dateOffsetSets: number[][] = [
    [7, 21, 56, 84, 105],
    [14, 35, 63, 91, 112],
    [3, 28, 49, 77, 98],
    [10, 42, 70, 88, 115],
    [5, 19, 58, 80, 107],
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
