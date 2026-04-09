import { clerkClient } from '@clerk/nextjs/server';
import { initTRPC, TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { type UserRole } from '@scheduler/types';
import superjson from 'superjson';

import { getAuthSession, type AuthSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { tenants } from '@/lib/db/schema';

/**
 * tRPC initialization with context + middleware chain.
 *
 * Middleware layers (applied in order):
 * 1. publicProcedure    — no auth required
 * 2. authedProcedure    — must be signed in (Clerk session)
 * 3. tenantProcedure    — must have active org + resolves tenant UUID + sets RLS
 * 4. adminProcedure     — must be university_admin
 * 5. lecturerProcedure  — must be lecturer (or admin)
 */

export type TrpcContext = {
  db: typeof db;
  session: (AuthSession & { tenantId: string }) | null;
};

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        message:
          process.env.NODE_ENV === 'production' && error.code === 'INTERNAL_SERVER_ERROR'
            ? 'An internal error occurred'
            : shape.message,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

// ---------- Public ----------
export const publicProcedure = t.procedure;

// ---------- Authenticated ----------
const enforceAuth = t.middleware(async ({ next }) => {
  const session = await getAuthSession();

  return next({
    ctx: {
      session: { ...session, tenantId: '' },
      db,
    },
  });
});

export const authedProcedure = t.procedure.use(enforceAuth);

// ---------- Tenant-scoped (resolves tenant UUID + sets RLS) ----------
const enforceTenant = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  // Look up the tenant by Clerk org ID
  let [tenant] = await ctx.db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.clerkOrgId, ctx.session.clerkOrgId));

  // Auto-create tenant if it doesn't exist yet (first request after org creation)
  if (!tenant) {
    // Fetch the real org name from Clerk
    let orgName = ctx.session.clerkOrgId;
    let orgSlug = ctx.session.clerkOrgId.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    try {
      const clerk = await clerkClient();
      const org = await clerk.organizations.getOrganization({ organizationId: ctx.session.clerkOrgId });
      orgName = org.name;
      orgSlug = org.slug ?? orgSlug;
    } catch {
      // Fall back to clerkOrgId if Clerk API fails
    }

    const [created] = await ctx.db
      .insert(tenants)
      .values({
        clerkOrgId: ctx.session.clerkOrgId,
        name: orgName,
        slug: orgSlug,
      })
      .returning({ id: tenants.id });
    tenant = created;
  }

  if (!tenant) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to resolve tenant' });
  }

  // Fix tenants that were created before we fetched the real org name
  // (one-time self-healing: if name still looks like a Clerk org ID, update it)
  const [currentTenant] = await ctx.db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenant.id));
  if (currentTenant?.name.startsWith('org_')) {
    try {
      const clerk = await clerkClient();
      const org = await clerk.organizations.getOrganization({ organizationId: ctx.session.clerkOrgId });
      await ctx.db
        .update(tenants)
        .set({ name: org.name, slug: org.slug ?? currentTenant.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() })
        .where(eq(tenants.id, tenant.id));
    } catch {
      // Ignore — will retry next request
    }
  }

  // Set the RLS context so all subsequent queries are scoped to this tenant
  await ctx.db.execute(
    `SELECT set_config('app.current_tenant_id', '${tenant.id}', true)`,
  );

  return next({
    ctx: {
      ...ctx,
      session: { ...ctx.session, tenantId: tenant.id },
    },
  });
});

export const tenantProcedure = authedProcedure.use(enforceTenant);

// ---------- Role-based ----------
function enforceRole(allowedRoles: UserRole[]) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.session) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    if (!allowedRoles.includes(ctx.session.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Role '${ctx.session.role}' is not authorized. Required: ${allowedRoles.join(', ')}`,
      });
    }

    return next({ ctx });
  });
}

export const adminProcedure = tenantProcedure.use(
  enforceRole(['super_admin', 'university_admin']),
);

export const lecturerProcedure = tenantProcedure.use(
  enforceRole(['super_admin', 'university_admin', 'lecturer']),
);
