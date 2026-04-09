import 'server-only';

import { cache } from 'react';

import type { TrpcContext } from './trpc';
import { createCallerFactory } from './trpc';
import { appRouter } from './root';
import { db } from '@/lib/db';
import { getAuthSession } from '@/lib/auth';

/**
 * Server-side tRPC caller for use in Server Components and Server Actions.
 *
 * Usage:
 *   const api = await createServerApi();
 *   const rooms = await api.rooms.list();
 */
const createCaller = createCallerFactory(appRouter);

export const createServerApi = cache(async () => {
  let session: TrpcContext['session'] = null;
  try {
    const authSession = await getAuthSession();
    // tenantId is populated by the enforceTenant middleware at runtime;
    // provide an empty placeholder so the type satisfies TrpcContext.
    session = { ...authSession, tenantId: '' };
  } catch {
    // Not authenticated — session stays null (public procedures still work)
  }

  return createCaller({
    db,
    session,
  });
});
