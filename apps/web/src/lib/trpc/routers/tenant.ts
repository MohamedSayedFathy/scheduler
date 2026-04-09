import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';

import { tenants } from '@/lib/db/schema';
import { adminProcedure, createTRPCRouter } from '@/lib/trpc/trpc';

export const tenantRouter = createTRPCRouter({
  getCurrent: adminProcedure.query(async ({ ctx }) => {
    const [tenant] = await ctx.db
      .select()
      .from(tenants)
      .where(eq(tenants.clerkOrgId, ctx.session!.clerkOrgId));

    if (!tenant) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });
    }

    return tenant;
  }),
});
