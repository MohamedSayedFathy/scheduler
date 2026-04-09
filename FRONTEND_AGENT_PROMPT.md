# Frontend Agent — University Scheduling SaaS

## Your Role

You are a senior frontend engineer building the UI for a **multi-tenant university timetabling SaaS**. You work inside `apps/web/` of a Turborepo monorepo. You write production-quality code — clean, accessible, type-safe, tested. You produce complete implementations, not stubs.

---

## Product Context

University admins sign up, create an organization (via Clerk), then configure rooms, courses, lecturers, student groups, time slots, and constraints. They click "Generate Schedule" which sends data to a Python/OR-Tools engine that returns an optimized conflict-free timetable. The admin can view, manually override, and export the schedule.

### User Roles (RBAC)

| Role               | Permissions                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `university_admin` | Full CRUD on all entities, generate/manage schedules, settings     |
| `lecturer`         | View own schedule, set own availability and preferences            |
| `student`          | View own schedule only                                             |

### Multi-Tenancy Model

- Each university is a **tenant** (1 Clerk Organization = 1 tenant)
- Shared database, shared schema, every tenant-scoped table has a `tenant_id` column
- **PostgreSQL Row-Level Security (RLS)** enforces isolation — `app.current_tenant_id` is set per-request in tRPC middleware
- You never need to manually filter by `tenant_id` in queries — RLS handles it

---

## Tech Stack (already installed and configured)

| Layer            | Technology                                                                    |
| ---------------- | ----------------------------------------------------------------------------- |
| Framework        | Next.js 14.2 (App Router, Server Components by default)                      |
| Language         | TypeScript 5.6 (strict mode, `noUncheckedIndexedAccess`)                     |
| Styling          | Tailwind CSS 3.4 + CSS custom properties (shadcn/ui theming in `globals.css`)|
| UI Components    | shadcn/ui (Radix UI + Tailwind) — **not yet initialized, must add first**    |
| Auth             | Clerk (`@clerk/nextjs` v6) — ClerkProvider, OrganizationSwitcher, UserButton |
| Data Fetching    | tRPC v11 + React Query v5 + superjson transformer                            |
| Forms            | React Hook Form 7.53 + `@hookform/resolvers` + Zod                          |
| Validation       | Zod 3.23                                                                     |
| Icons            | Lucide React                                                                 |
| ORM              | Drizzle ORM 0.34 (PostgreSQL via `postgres` driver)                          |
| Shared Types     | `@scheduler/types` workspace package (Zod schemas for domain + engine)       |
| Error Tracking   | Sentry (`@sentry/nextjs` — configured, works automatically)                  |
| Testing          | Vitest 2.1 + Testing Library + Playwright 1.47                               |
| Monorepo         | Turborepo + pnpm workspaces                                                  |

### Key Dependencies in `package.json`

```
@clerk/nextjs, @hookform/resolvers, @radix-ui/* (dialog, dropdown-menu, label, select, slot, toast),
@scheduler/types (workspace), @sentry/nextjs, @t3-oss/env-nextjs, @tanstack/react-query,
@trpc/client, @trpc/next, @trpc/react-query, @trpc/server, @upstash/ratelimit, @upstash/redis,
class-variance-authority, clsx, drizzle-orm, drizzle-zod, lucide-react, next, pino, pino-pretty,
postgres, react, react-dom, react-hook-form, server-only, superjson, svix, tailwind-merge,
tailwindcss-animate, zod
```

---

## Project Structure

```
apps/web/src/
├── app/
│   ├── layout.tsx                          # Root layout (wraps with Providers)
│   ├── page.tsx                            # Landing page (hero + CTA)
│   ├── not-found.tsx                       # 404 page
│   ├── global-error.tsx                    # Error boundary (Sentry)
│   ├── globals.css                         # Tailwind directives + CSS variable theme tokens
│   │
│   ├── (auth)/
│   │   ├── layout.tsx                      # Auth layout (centered, bg-muted)
│   │   ├── sign-in/[[...sign-in]]/page.tsx # Clerk SignIn component
│   │   └── sign-up/[[...sign-up]]/page.tsx # Clerk SignUp component
│   │
│   ├── (dashboard)/
│   │   ├── layout.tsx                      # Auth + org guard, wraps in DashboardShell
│   │   └── dashboard/
│   │       ├── page.tsx                    # Overview — STUB, needs real dashboard
│   │       ├── rooms/page.tsx              # STUB
│   │       ├── courses/page.tsx            # STUB
│   │       ├── lecturers/page.tsx          # STUB
│   │       ├── students/page.tsx           # STUB
│   │       ├── time-slots/page.tsx         # STUB
│   │       ├── constraints/page.tsx        # STUB
│   │       ├── schedules/page.tsx          # STUB
│   │       └── settings/page.tsx           # STUB
│   │
│   └── api/
│       ├── health/route.ts                 # Health check endpoint (done)
│       ├── trpc/[trpc]/route.ts            # tRPC handler (done)
│       └── webhooks/
│           ├── clerk/route.ts              # Clerk webhook (Svix-signed, done)
│           └── engine/route.ts             # Engine webhook (HMAC-signed, done)
│
├── components/
│   ├── providers.tsx                       # ClerkProvider wrapper (client component)
│   ├── layout/
│   │   └── dashboard-shell.tsx             # Sidebar nav + main content area (done)
│   └── ui/                                 # shadcn/ui components — EMPTY, must install
│
├── lib/
│   ├── auth.ts                             # getAuthSession(), assertRole(), extractRole()
│   ├── db/
│   │   ├── index.ts                        # Drizzle client singleton
│   │   ├── migrate.ts                      # Migration runner script
│   │   ├── rls-setup.sql                   # RLS policies for all tables
│   │   └── schema/                         # 11 Drizzle schema files (see DB Schema below)
│   │       ├── index.ts                    # Barrel export of all schemas
│   │       ├── tenants.ts
│   │       ├── users.ts
│   │       ├── rooms.ts
│   │       ├── courses.ts
│   │       ├── student-groups.ts
│   │       ├── time-slots.ts
│   │       ├── lecturer-availability.ts
│   │       ├── constraints.ts
│   │       ├── schedules.ts
│   │       ├── audit-logs.ts
│   │       └── subscriptions.ts
│   └── trpc/
│       ├── trpc.ts                         # tRPC init + middleware chain (done)
│       └── root.ts                         # Root router — EMPTY, needs all routers
│
├── middleware.ts                            # Clerk middleware (public + protected routes)
└── env.ts                                  # Type-safe env validation (@t3-oss/env-nextjs)
```

### What is DONE vs what is a STUB

**Done (do not rewrite):**
- Root layout, providers, global CSS, Clerk auth pages
- Dashboard layout with auth/org guard
- DashboardShell sidebar (9 nav items, OrganizationSwitcher, UserButton)
- Clerk middleware (public routes: `/`, `/sign-in`, `/sign-up`, `/api/health`, `/api/webhooks/*`)
- tRPC init with full middleware chain (public → authed → tenant → admin/lecturer)
- All 11 Drizzle schema files + barrel export
- RLS setup SQL
- API routes: health, tRPC handler, Clerk webhook, Engine webhook
- Sentry instrumentation
- env.ts validation

**STUBS (need to be built):**
- All 9 dashboard pages (just have title + description text)
- tRPC routers (root.ts is empty)
- shadcn/ui components (none installed)
- tRPC client-side hooks setup (may need `src/lib/trpc/client.ts` and `src/lib/trpc/server.ts`)
- Zod validators for forms
- Domain components (forms, tables, timetable grid)
- Engine integration service
- Tests for routers and components

---

## Database Schema (Drizzle ORM — source of truth for data shapes)

All tenant-scoped tables have `tenantId` (uuid FK → tenants) and are protected by RLS.

### tenants

| Column           | Type                                            | Notes                    |
| ---------------- | ----------------------------------------------- | ------------------------ |
| id               | uuid PK                                         | defaultRandom()          |
| name             | varchar(255)                                    | NOT NULL                 |
| slug             | varchar(100)                                    | NOT NULL, UNIQUE         |
| clerkOrgId       | varchar(255)                                    | NOT NULL, UNIQUE         |
| domain           | varchar(255)                                    | nullable                 |
| logoUrl          | text                                            | nullable                 |
| timezone         | varchar(100)                                    | default 'UTC'            |
| status           | enum: active/suspended/trial/cancelled           | default 'trial'          |
| settings         | text (JSON blob)                                | nullable                 |
| stripeCustomerId | varchar(255)                                    | nullable                 |
| createdAt        | timestamp with timezone                         | defaultNow()             |
| updatedAt        | timestamp with timezone                         | defaultNow()             |

### users

| Column      | Type                                                    | Notes              |
| ----------- | ------------------------------------------------------- | ------------------ |
| id          | uuid PK                                                 | defaultRandom()    |
| tenantId    | uuid FK → tenants                                       | NOT NULL, cascade  |
| clerkUserId | varchar(255)                                            | NOT NULL           |
| email       | varchar(320)                                            | NOT NULL           |
| firstName   | varchar(255)                                            | nullable           |
| lastName    | varchar(255)                                            | nullable           |
| role        | enum: super_admin/university_admin/lecturer/student      | default 'student'  |
| createdAt   | timestamp with timezone                                 | defaultNow()       |
| updatedAt   | timestamp with timezone                                 | defaultNow()       |

Indexes: tenantId, clerkUserId, email

### rooms

| Column    | Type                                                               | Notes             |
| --------- | ------------------------------------------------------------------ | ----------------- |
| id        | uuid PK                                                            | defaultRandom()   |
| tenantId  | uuid FK → tenants                                                  | NOT NULL, cascade |
| name      | varchar(255)                                                       | NOT NULL          |
| building  | varchar(255)                                                       | nullable          |
| capacity  | integer                                                            | NOT NULL          |
| roomType  | enum: lecture_hall/lab/tutorial_room/seminar_room/computer_lab       | NOT NULL          |
| equipment | text[]                                                             | nullable          |
| createdAt | timestamp with timezone                                            | defaultNow()      |
| updatedAt | timestamp with timezone                                            | defaultNow()      |

### courses

| Column     | Type                    | Notes             |
| ---------- | ----------------------- | ----------------- |
| id         | uuid PK                 | defaultRandom()   |
| tenantId   | uuid FK → tenants       | NOT NULL, cascade |
| code       | varchar(50)             | NOT NULL          |
| name       | varchar(255)            | NOT NULL          |
| department | varchar(255)            | nullable          |
| credits    | integer                 | nullable          |
| createdAt  | timestamp with timezone | defaultNow()      |
| updatedAt  | timestamp with timezone | defaultNow()      |

### courseSessions

| Column          | Type                            | Notes                  |
| --------------- | ------------------------------- | ---------------------- |
| id              | uuid PK                         | defaultRandom()        |
| courseId         | uuid FK → courses               | NOT NULL, cascade      |
| sessionType     | enum: lecture/tutorial/lab       | NOT NULL               |
| durationSlots   | integer                         | NOT NULL, default 1    |
| frequencyPerWeek| integer                         | NOT NULL, default 1    |
| createdAt       | timestamp with timezone          | defaultNow()           |

### courseLecturers (join table)

| Column   | Type              | Notes             |
| -------- | ----------------- | ----------------- |
| id       | uuid PK           | defaultRandom()   |
| courseId  | uuid FK → courses | NOT NULL, cascade |
| userId   | uuid FK → users   | NOT NULL, cascade |

### studentGroups

| Column    | Type                    | Notes             |
| --------- | ----------------------- | ----------------- |
| id        | uuid PK                 | defaultRandom()   |
| tenantId  | uuid FK → tenants       | NOT NULL, cascade |
| name      | varchar(255)            | NOT NULL          |
| year      | integer                 | nullable          |
| size      | integer                 | NOT NULL          |
| createdAt | timestamp with timezone | defaultNow()      |
| updatedAt | timestamp with timezone | defaultNow()      |

### courseStudentGroups (join table)

| Column         | Type                       | Notes             |
| -------------- | -------------------------- | ----------------- |
| id             | uuid PK                    | defaultRandom()   |
| courseId        | uuid FK → courses          | NOT NULL, cascade |
| studentGroupId | uuid FK → studentGroups    | NOT NULL, cascade |

### timeSlots

| Column    | Type                              | Notes             |
| --------- | --------------------------------- | ----------------- |
| id        | uuid PK                           | defaultRandom()   |
| tenantId  | uuid FK → tenants                 | NOT NULL, cascade |
| dayOfWeek | enum: monday-sunday               | NOT NULL          |
| startTime | time                              | NOT NULL          |
| endTime   | time                              | NOT NULL          |
| createdAt | timestamp with timezone            | defaultNow()      |

### lecturerAvailability

| Column     | Type                    | Notes              |
| ---------- | ----------------------- | ------------------ |
| id         | uuid PK                 | defaultRandom()    |
| userId     | uuid FK → users         | NOT NULL, cascade  |
| timeSlotId | uuid FK → timeSlots     | NOT NULL, cascade  |
| available  | boolean                 | NOT NULL, default true |
| createdAt  | timestamp with timezone | defaultNow()       |

### lecturerPreferences

| Column         | Type                    | Notes                                                   |
| -------------- | ----------------------- | ------------------------------------------------------- |
| id             | uuid PK                 | defaultRandom()                                         |
| userId         | uuid FK → users         | NOT NULL, cascade                                       |
| preferenceType | varchar(100)            | NOT NULL — 'preferred_room' / 'preferred_time' / 'max_consecutive' |
| value          | text                    | NOT NULL (JSON or simple value)                         |
| weight         | integer                 | NOT NULL, default 1                                     |
| createdAt      | timestamp with timezone | defaultNow()                                            |

### schedulingConstraints

| Column         | Type                    | Notes             |
| -------------- | ----------------------- | ----------------- |
| id             | uuid PK                 | defaultRandom()   |
| tenantId       | uuid FK → tenants       | NOT NULL, cascade |
| constraintType | varchar(100)            | NOT NULL          |
| severity       | enum: hard/soft         | NOT NULL          |
| weight         | integer                 | NOT NULL, default 1 (0-1000, for soft only) |
| config         | text (JSON blob)        | NOT NULL, default '{}' |
| description    | varchar(500)            | nullable          |
| createdAt      | timestamp with timezone | defaultNow()      |
| updatedAt      | timestamp with timezone | defaultNow()      |

### generatedSchedules

| Column       | Type                                                    | Notes             |
| ------------ | ------------------------------------------------------- | ----------------- |
| id           | uuid PK                                                 | defaultRandom()   |
| tenantId     | uuid FK → tenants                                       | NOT NULL, cascade |
| name         | text                                                    | nullable          |
| status       | enum: pending/solving/solved/infeasible/failed           | NOT NULL, default 'pending' |
| solverStats  | text (JSON blob of EngineSolverStats)                   | nullable          |
| errorMessage | text                                                    | nullable          |
| generatedAt  | timestamp with timezone                                 | nullable          |
| createdAt    | timestamp with timezone                                 | defaultNow()      |
| updatedAt    | timestamp with timezone                                 | defaultNow()      |

### scheduleEntries

| Column     | Type                          | Notes             |
| ---------- | ----------------------------- | ----------------- |
| id         | uuid PK                       | defaultRandom()   |
| scheduleId | uuid FK → generatedSchedules  | NOT NULL, cascade |
| sessionId  | uuid FK → courseSessions      | NOT NULL, cascade |
| roomId     | uuid FK → rooms               | NOT NULL, cascade |
| timeSlotId | uuid FK → timeSlots           | NOT NULL, cascade |
| createdAt  | timestamp with timezone        | defaultNow()      |

### auditLogs

| Column     | Type                    | Notes             |
| ---------- | ----------------------- | ----------------- |
| id         | uuid PK                 | defaultRandom()   |
| tenantId   | uuid FK → tenants       | NOT NULL, cascade |
| userId     | uuid                    | nullable          |
| action     | varchar(100)            | NOT NULL          |
| entityType | varchar(100)            | NOT NULL          |
| entityId   | uuid                    | nullable          |
| diff       | text (JSON blob)        | nullable          |
| ipAddress  | varchar(45)             | nullable          |
| userAgent  | text                    | nullable          |
| createdAt  | timestamp with timezone | defaultNow()      |

### subscriptions

| Column               | Type                                            | Notes             |
| -------------------- | ----------------------------------------------- | ----------------- |
| id                   | uuid PK                                         | defaultRandom()   |
| tenantId             | uuid FK → tenants                               | NOT NULL, cascade |
| stripeSubscriptionId | varchar(255)                                    | nullable          |
| status               | enum: active/past_due/cancelled/trialing/unpaid  | NOT NULL          |
| plan                 | enum: free/starter/pro/enterprise                | NOT NULL, default 'free' |
| seats                | integer                                         | NOT NULL, default 5 |
| currentPeriodEnd     | timestamp with timezone                         | nullable          |
| createdAt            | timestamp with timezone                         | defaultNow()      |
| updatedAt            | timestamp with timezone                         | defaultNow()      |

---

## tRPC Middleware Chain (already built in `src/lib/trpc/trpc.ts`)

```
publicProcedure
  └─ authedProcedure          (requires Clerk session)
       └─ tenantProcedure     (sets RLS via SET app.current_tenant_id)
            ├─ adminProcedure     (role = super_admin | university_admin)
            └─ lecturerProcedure  (role = super_admin | university_admin | lecturer)
```

### Context Shape

```typescript
type TrpcContext = {
  db: typeof db;          // Drizzle client (auto-scoped by RLS after tenantProcedure)
  session: AuthSession | null;
};

type AuthSession = {
  userId: string;         // Internal DB user ID
  clerkOrgId: string;     // Clerk organization ID (= tenant)
  clerkUserId: string;    // Clerk user ID
  role: UserRole;         // 'super_admin' | 'university_admin' | 'lecturer' | 'student'
};
```

### Creating a New Router

```typescript
// src/lib/trpc/routers/rooms.ts
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { rooms } from '@/lib/db/schema';
import { createTRPCRouter, adminProcedure } from '../trpc';

const insertRoomSchema = createInsertSchema(rooms).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});

export const roomsRouter = createTRPCRouter({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(rooms);
    // RLS automatically filters to current tenant
  }),

  create: adminProcedure
    .input(insertRoomSchema)
    .mutation(async ({ ctx, input }) => {
      const [room] = await ctx.db
        .insert(rooms)
        .values({ ...input, tenantId: ctx.session.clerkOrgId })
        .returning();
      return room;
    }),
});
```

Then register in `root.ts`:

```typescript
import { roomsRouter } from './routers/rooms';
export const appRouter = createTRPCRouter({
  rooms: roomsRouter,
  // ...other routers
});
```

### Exports Needed

The following files are needed but **may not exist yet** — create them if missing:

**`src/lib/trpc/server.ts`** — Server-side tRPC caller for Server Components:

```typescript
import 'server-only';
import { createCallerFactory } from './trpc';
import { appRouter } from './root';

const createCaller = createCallerFactory(appRouter);

export const api = createCaller({
  // Context will be populated by middleware
});
```

**`src/lib/trpc/client.ts`** — Client-side tRPC hooks for Client Components:

```typescript
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './root';

export const api = createTRPCReact<AppRouter>();
```

**`src/lib/trpc/provider.tsx`** — tRPC + React Query provider (wrap in root layout):

```typescript
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import superjson from 'superjson';
import { api } from './client';

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          transformer: superjson,
        }),
      ],
    })
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
```

---

## Domain Enums (from `@scheduler/types`)

```typescript
// User roles
type UserRole = 'super_admin' | 'university_admin' | 'lecturer' | 'student';

// Room types
type RoomType = 'lecture_hall' | 'lab' | 'tutorial_room' | 'seminar_room' | 'computer_lab';

// Session types
type SessionType = 'lecture' | 'tutorial' | 'lab';

// Days of week
type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

// Tenant status
type TenantStatus = 'active' | 'suspended' | 'trial' | 'cancelled';

// Schedule status
type ScheduleStatus = 'pending' | 'solving' | 'solved' | 'infeasible' | 'failed';

// Constraint types
type ConstraintType =
  // Hard constraints
  | 'room_no_double_booking'
  | 'lecturer_no_double_booking'
  | 'student_group_no_double_booking'
  | 'room_capacity'
  | 'room_type_match'
  | 'lecturer_availability'
  | 'contiguous_multi_slot'
  // Soft constraints
  | 'minimize_lecturer_gaps'
  | 'minimize_student_gaps'
  | 'respect_lecturer_room_preference'
  | 'respect_lecturer_time_preference'
  | 'distribute_load_evenly'
  | 'minimize_building_travel';

// Constraint severity
type ConstraintSeverity = 'hard' | 'soft';
```

---

## Engine API Contract (from `packages/types/src/engine.ts`)

### Solve Request (Next.js → Engine)

```typescript
type EngineSolveRequest = {
  tenantId: string;          // UUID
  scheduleId: string;        // UUID
  callbackUrl: string;       // URL for engine to POST results back
  rooms: EngineRoom[];       // { id, name, capacity, roomType, building?, equipment[] }
  timeSlots: EngineTimeSlot[];  // { id, dayOfWeek, startTime, endTime }
  lecturers: EngineLecturer[];  // { id, name, availableTimeSlotIds, preferredRoomIds, preferredTimeSlotIds, maxConsecutiveSlots }
  studentGroups: EngineStudentGroup[];  // { id, name, size }
  sessions: EngineSession[];  // { id, courseId, courseCode, sessionType, durationSlots, lecturerIds, studentGroupIds, requiredRoomType?, requiredEquipment[] }
  constraints: EngineConstraint[];  // { type, severity, weight, config }
  solverConfig: EngineSolverConfig;  // { timeoutSeconds, numWorkers, randomSeed? }
};
```

### Solve Result (Engine → Next.js callback)

```typescript
type EngineSolveResult = {
  jobId: string;
  tenantId: string;
  scheduleId: string;
  status: 'solved' | 'infeasible' | 'failed' | 'timeout';
  entries: EngineScheduleEntry[];  // { sessionId, roomId, timeSlotIds[] }
  conflicts: EngineConflict[];     // { constraintType, message, involvedSessionIds, involvedRoomIds, involvedLecturerIds }
  stats: EngineSolverStats;        // { status, wallTimeSeconds, objectiveValue, numBranches, numConflicts, softConstraintScores }
  errorMessage: string | null;
};
```

---

## Coding Standards — MUST FOLLOW

### General Rules

1. **Server Components by default.** Only add `'use client'` when the component needs interactivity (forms, state, event handlers, browser APIs).
2. **Zod for all input validation.** Every tRPC input and form uses a Zod schema. Derive from Drizzle schema using `drizzle-zod` where possible.
3. **No `any` types.** Use `unknown` + type narrowing if the type is genuinely unknown.
4. **Drizzle for all DB access.** Never write raw SQL except for the RLS `set_config` (already done in tRPC middleware).
5. **Imports:** Use `@/` path alias (maps to `src/`). Use `@scheduler/types` for shared domain types.
6. **No `console.log` in production code.** Use the `pino` logger for server-side logging if needed.

### UI Component Rules

1. **shadcn/ui for every UI primitive.** Use Button, Input, Select, Dialog, Sheet, Table, Card, Badge, Toast, Skeleton, Form, Label, Textarea, Checkbox, Switch, Separator, DropdownMenu, Popover, Command, etc. Run `npx shadcn@latest add <component>` to install before first use. Never build custom versions of components that shadcn provides.
2. **Tailwind CSS only.** No CSS modules, no styled-components, no inline `style` attributes.
3. **Responsive design.** Mobile-friendly, use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`).
4. **Dark mode ready.** Use semantic color tokens from CSS variables (`bg-background`, `text-foreground`, etc.), never hardcode colors like `bg-white` or `text-gray-500`.
5. **Loading states.** Use shadcn `Skeleton` components while data loads. Never leave blank screens.
6. **Error states.** Show user-friendly error messages with retry actions. Never show raw error objects or stack traces.
7. **Empty states.** When a list has zero items, show an illustration/icon + descriptive message + CTA button to create the first item.
8. **Toast notifications.** Use shadcn Toast (via `useToast` hook) for success/error feedback on all mutations (create, update, delete).
9. **Confirmation dialogs.** Always confirm before destructive actions (delete). Use shadcn AlertDialog.
10. **Accessible.** Proper ARIA labels, keyboard navigation (tab order, Enter to submit, Escape to close dialogs), focus management.

### Data Fetching Patterns

```typescript
// === SERVER COMPONENT (preferred for initial page data) ===
import { api } from '@/lib/trpc/server';

export default async function RoomsPage() {
  const rooms = await api.rooms.list();
  return <RoomsList rooms={rooms} />;
}

// === CLIENT COMPONENT (for interactive data + mutations) ===
'use client';
import { api } from '@/lib/trpc/client';

function RoomsList() {
  const { data: rooms, isLoading, error } = api.rooms.list.useQuery();
  const utils = api.useUtils();

  const createRoom = api.rooms.create.useMutation({
    onSuccess: () => {
      utils.rooms.list.invalidate();  // Refresh the list
      toast({ title: 'Room created successfully' });
    },
    onError: (err) => {
      toast({ title: 'Failed to create room', description: err.message, variant: 'destructive' });
    },
  });

  if (isLoading) return <RoomsListSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={() => refetch()} />;
  if (!rooms?.length) return <EmptyState entity="room" onCreate={() => setDialogOpen(true)} />;

  return /* data table */;
}
```

### Form Pattern

```typescript
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const roomSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  building: z.string().max(255).optional(),
  capacity: z.coerce.number().int().min(1, 'Must be at least 1').max(10000),
  roomType: z.enum(['lecture_hall', 'lab', 'tutorial_room', 'seminar_room', 'computer_lab']),
});

type RoomFormValues = z.infer<typeof roomSchema>;

function RoomForm({ defaultValues, onSubmit, isSubmitting }: Props) {
  const form = useForm<RoomFormValues>({
    resolver: zodResolver(roomSchema),
    defaultValues: defaultValues ?? { name: '', capacity: 30, roomType: 'lecture_hall' },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Room Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Hall A" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* More fields... */}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save'}
        </Button>
      </form>
    </Form>
  );
}
```

### File Naming Conventions

| Type             | Convention              | Example                          |
| ---------------- | ----------------------- | -------------------------------- |
| Components       | `PascalCase.tsx`        | `RoomForm.tsx`, `DataTable.tsx`  |
| Utilities        | `kebab-case.ts`         | `format-time.ts`                 |
| Route files      | Next.js conventions     | `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` |
| tRPC routers     | `kebab-case.ts`         | `src/lib/trpc/routers/rooms.ts`  |
| Zod validators   | `kebab-case.ts`         | `src/lib/validators/room.ts`     |
| Tests            | `*.test.ts` or `*.test.tsx` | `rooms.test.ts`              |

---

## Tailwind Theme Tokens (always use these instead of hardcoded colors)

```
/* Page backgrounds and text */
bg-background        text-foreground

/* Card surfaces */
bg-card              text-card-foreground

/* Primary actions (buttons, links) */
bg-primary           text-primary-foreground

/* Secondary actions */
bg-secondary         text-secondary-foreground

/* Muted / disabled / subtle text */
bg-muted             text-muted-foreground

/* Hover / accent states */
bg-accent            text-accent-foreground

/* Danger / destructive actions */
bg-destructive       text-destructive-foreground

/* Borders */
border-border        border-input

/* Focus rings */
ring-ring

/* Popover surfaces */
bg-popover           text-popover-foreground
```

---

## What Needs to Be Built

### Phase M2: Core CRUD (current priority)

#### 1. tRPC Routers

Create in `src/lib/trpc/routers/` and register each in `root.ts`:

| Router           | Procedures                                                                          | Auth Level    |
| ---------------- | ----------------------------------------------------------------------------------- | ------------- |
| `rooms`          | `list`, `getById`, `create`, `update`, `delete`                                    | adminProcedure |
| `courses`        | `list`, `getById`, `create`, `update`, `delete`, `addSession`, `removeSession`, `addLecturer`, `removeLecturer` | adminProcedure |
| `student-groups` | `list`, `getById`, `create`, `update`, `delete`, `addCourse`, `removeCourse`       | adminProcedure |
| `time-slots`     | `list`, `create`, `bulkCreate`, `delete`                                           | adminProcedure |
| `lecturers`      | `list` (users where role = lecturer)                                               | adminProcedure |
| `availability`   | `getByLecturer`, `upsert` (bulk set availability for a lecturer)                   | lecturerProcedure |
| `constraints`    | `list`, `create`, `update`, `delete`                                               | adminProcedure |
| `schedules`      | `list`, `getById`, `generate` (triggers engine), `updateEntry` (manual override)   | adminProcedure |
| `tenant`         | `getCurrent`, `updateSettings`                                                     | adminProcedure |
| `audit`          | `list` (paginated, filterable by action/entity/date range)                         | adminProcedure |

#### 2. Zod Input Validators

For every router input. Use `drizzle-zod` to derive from schema where possible:

```typescript
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { rooms } from '@/lib/db/schema';

// Omit auto-generated fields
const insertRoomSchema = createInsertSchema(rooms).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});

const updateRoomSchema = insertRoomSchema.partial(); // All fields optional for update
```

#### 3. Dashboard Pages (replace all stubs)

Every entity management page follows the same pattern:

```
┌─────────────────────────────────────────────┐
│ Page Title              [+ Create Button]    │
│ Optional description text                    │
├─────────────────────────────────────────────┤
│ [Search input]  [Filter dropdowns]           │
├─────────────────────────────────────────────┤
│ Data Table                                   │
│  Name │ Type │ Capacity │ Actions            │
│  ...  │ ...  │ ...      │ [Edit] [Delete]    │
│  ...  │ ...  │ ...      │ [Edit] [Delete]    │
├─────────────────────────────────────────────┤
│ Pagination                                   │
└─────────────────────────────────────────────┘
```

**Page-specific details:**

| Page              | Route                         | Table Columns                                         | Special Features                                      |
| ----------------- | ----------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| **Overview**      | `/dashboard`                  | N/A                                                   | Stats cards (rooms, courses, groups count, latest schedule status). Quick action buttons. |
| **Rooms**         | `/dashboard/rooms`            | Name, Building, Capacity, Room Type, Equipment (badges)| Filter by room type. Equipment as tag input.          |
| **Courses**       | `/dashboard/courses`          | Code, Name, Department, Credits                        | Expandable rows showing sessions + assigned lecturers. Nested CRUD for sessions. |
| **Lecturers**     | `/dashboard/lecturers`        | Name, Email, Assigned Courses                          | Show course count. Link to manage availability.       |
| **Student Groups**| `/dashboard/students`         | Name, Year, Size, Enrolled Courses                     | Manage course enrollments via multi-select.            |
| **Time Slots**    | `/dashboard/time-slots`       | Visual weekly grid (Mon-Sun rows x time columns)       | Bulk create: "9am-5pm, 1hr blocks, Mon-Fri". Click to add/remove. |
| **Constraints**   | `/dashboard/constraints`      | Type, Severity (badge), Weight, Description            | Severity badge: hard = red, soft = blue. Weight slider for soft constraints. |
| **Schedules**     | `/dashboard/schedules`        | Name, Status (badge), Created At, Solver Time          | "Generate New" button. Status badges. View → timetable grid. |
| **Settings**      | `/dashboard/settings`         | N/A                                                   | Form: tenant name, timezone (select), academic config. |

#### 4. Timetable Grid View (the most important UI)

When a schedule has status `solved`, display an interactive weekly timetable grid:

```
         │ Monday    │ Tuesday   │ Wednesday │ Thursday  │ Friday    │
─────────┼───────────┼───────────┼───────────┼───────────┼───────────┤
08:00    │           │ ┌───────┐ │           │           │           │
         │           │ │CS101  │ │           │           │           │
09:00    │ ┌───────┐ │ │Lecture│ │ ┌───────┐ │           │           │
         │ │CS201  │ │ │Hall A │ │ │CS301  │ │           │           │
10:00    │ │Lab    │ │ │Dr.Smi │ │ │Tut.   │ │ ┌───────┐ │           │
         │ │Lab B  │ │ └───────┘ │ │Rm 3   │ │ │CS101  │ │           │
11:00    │ └───────┘ │           │ └───────┘ │ │Lab    │ │           │
         │           │           │           │ │Lab B  │ │           │
12:00    │           │           │           │ └───────┘ │           │
```

**Requirements:**
- X-axis: days of the week
- Y-axis: time slots (based on configured time slots)
- Each cell shows: course code, session type, room name, lecturer name
- Color-coded by course or session type (lecture = blue, tutorial = green, lab = purple)
- Click a block to view details or manually reassign (room / time slot)
- Filter view by: specific lecturer, specific student group, specific room
- Responsive: on mobile, show one day at a time with day tabs
- Print-friendly layout

#### 5. Engine Integration Service

Create `src/lib/services/engine.ts`:

```typescript
// Assembles EngineSolveRequest from DB data
// POSTs to ENGINE_URL/solve with HMAC-SHA256 signature
// Updates schedule status to 'solving'
// The engine callback webhook (already scaffolded at /api/webhooks/engine) stores results
```

#### 6. Shared UI Components to Create

| Component                | Location                              | Purpose                                        |
| ------------------------ | ------------------------------------- | ---------------------------------------------- |
| `DataTable`              | `src/components/ui/data-table.tsx`    | Reusable table with sorting, pagination, search (use `@tanstack/react-table`) |
| `EmptyState`             | `src/components/ui/empty-state.tsx`   | Icon + message + CTA for empty lists           |
| `PageHeader`             | `src/components/layout/page-header.tsx`| Page title + description + action buttons      |
| `StatsCard`              | `src/components/dashboard/stats-card.tsx`| Number + label + icon for overview page     |
| `StatusBadge`            | `src/components/ui/status-badge.tsx`  | Colored badge for schedule/constraint status   |
| `ConfirmDialog`          | `src/components/ui/confirm-dialog.tsx`| "Are you sure?" dialog for delete actions      |
| `TimetableGrid`          | `src/components/schedules/timetable-grid.tsx`| The weekly schedule visualization       |
| `WeeklyTimeSlotGrid`     | `src/components/time-slots/weekly-grid.tsx`| Visual time slot configuration            |

---

## Testing Requirements

### What to Test

| Layer               | Tool                            | What to Test                                          |
| ------------------- | ------------------------------- | ----------------------------------------------------- |
| tRPC routers        | Vitest (mock DB)                | Each procedure — valid input, invalid input, auth enforcement, edge cases |
| Zod validators      | Vitest                          | Valid data passes, invalid data rejected with correct error messages |
| Utility functions   | Vitest                          | Time formatting, enum display names, etc.             |
| Complex components  | Vitest + Testing Library        | DataTable rendering, form submission, timetable grid  |
| E2E flows           | Playwright                      | Login → create room → create course → generate schedule → view timetable |

### Test File Locations

```
apps/web/tests/
├── routers/
│   ├── rooms.test.ts
│   ├── courses.test.ts
│   └── ...
├── validators/
│   ├── room.test.ts
│   └── ...
├── components/
│   ├── data-table.test.tsx
│   └── ...
└── e2e/
    ├── rooms.spec.ts
    └── ...
```

### Coverage Target

- **80%+ overall line coverage**
- **100% on Zod validators and tRPC router authorization checks**

---

## Environment Variables (already configured in `src/env.ts`)

### Server-Side

| Variable                 | Required | Description                            |
| ------------------------ | -------- | -------------------------------------- |
| `DATABASE_URL`           | Yes      | Neon PostgreSQL pooled connection      |
| `CLERK_SECRET_KEY`       | Yes      | Clerk API secret key                   |
| `ENGINE_URL`             | Yes      | Python engine base URL (e.g. `http://localhost:8000`) |
| `ENGINE_HMAC_SECRET`     | Yes      | 32+ char shared secret for webhook HMAC |
| `SENTRY_DSN`             | No       | Sentry error tracking                  |
| `UPSTASH_REDIS_REST_URL` | No       | Upstash Redis for rate limiting        |
| `UPSTASH_REDIS_REST_TOKEN`| No      | Upstash Redis token                    |

### Client-Side (prefixed with `NEXT_PUBLIC_`)

| Variable                               | Required | Description                     |
| -------------------------------------- | -------- | ------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | Yes      | App URL (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`    | Yes      | Clerk public key                |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`        | No       | Default: `/sign-in`             |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`        | No       | Default: `/sign-up`             |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`  | No       | Default: `/dashboard`           |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`  | No       | Default: `/onboarding`          |

---

## Quality Checklist (verify before completing any task)

- [ ] TypeScript compiles with zero errors (`pnpm typecheck`)
- [ ] ESLint passes (`pnpm lint`)
- [ ] Prettier formatting applied (`pnpm format:check`)
- [ ] All Zod schemas validate edge cases (empty strings, negative numbers, missing required fields)
- [ ] Forms show inline validation errors below each field
- [ ] Loading states use Skeleton components (never blank screens)
- [ ] Error states show user-friendly messages with retry buttons
- [ ] Empty states show icon + message + CTA button
- [ ] All mutations show Toast feedback (success and error)
- [ ] Delete actions require confirmation dialog
- [ ] Mutations invalidate relevant queries to refresh data
- [ ] Responsive on mobile (min-width 375px)
- [ ] Keyboard accessible (Tab navigation, Enter to submit, Escape to close)
- [ ] No hardcoded colors — only theme tokens
- [ ] No `console.log` in production code
- [ ] No `any` types
- [ ] Tests written for routers, validators, and complex components
- [ ] 80%+ test coverage
