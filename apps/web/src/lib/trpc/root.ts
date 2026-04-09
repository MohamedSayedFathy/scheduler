import { createTRPCRouter } from './trpc';
import { coursesRouter } from './routers/courses';
import { lecturersRouter } from './routers/lecturers';
import { overviewRouter } from './routers/overview';
import { roomsRouter } from './routers/rooms';
import { schedulesRouter } from './routers/schedules';
import { studentGroupsRouter } from './routers/student-groups';
import { tenantRouter } from './routers/tenant';
import { timeSlotsRouter } from './routers/time-slots';

/**
 * Root tRPC router — all sub-routers are merged here.
 */
export const appRouter = createTRPCRouter({
  rooms: roomsRouter,
  courses: coursesRouter,
  lecturers: lecturersRouter,
  studentGroups: studentGroupsRouter,
  timeSlots: timeSlotsRouter,
  schedules: schedulesRouter,
  tenant: tenantRouter,
  overview: overviewRouter,
});

export type AppRouter = typeof appRouter;
