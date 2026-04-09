'use client';

import { useAuth } from '@clerk/nextjs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, loggerLink } from '@trpc/client';
import { useEffect, useRef, useState } from 'react';
import superjson from 'superjson';

import { api } from './client';

function CacheClearer({ queryClient }: { queryClient: QueryClient }) {
  const { orgId } = useAuth();
  const prevOrgId = useRef(orgId);

  useEffect(() => {
    if (prevOrgId.current !== undefined && prevOrgId.current !== orgId) {
      queryClient.clear();
    }
    prevOrgId.current = orgId;
  }, [orgId, queryClient]);

  return null;
}

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            retry: 1,
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === 'development' ||
            (op.direction === 'down' && op.result instanceof Error),
        }),
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
        }),
      ],
    }),
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <CacheClearer queryClient={queryClient} />
        {children}
      </QueryClientProvider>
    </api.Provider>
  );
}
