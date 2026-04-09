import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import { appRouter } from '@/lib/trpc/root';
import { db } from '@/lib/db';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () =>
      Promise.resolve({
        db,
        session: null,
      }),
  });

export { handler as GET, handler as POST };
