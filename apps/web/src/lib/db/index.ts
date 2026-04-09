import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '@/env';
import * as schema from './schema';

/**
 * Database client singleton.
 *
 * Uses postgres.js driver with Neon's pooled connection.
 * The client is reused across requests in the same process.
 */

const globalForDb = globalThis as unknown as {
  queryClient: postgres.Sql | undefined;
};

function createQueryClient() {
  return postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // Required for Neon's connection pooler (pgbouncer)
  });
}

const queryClient = globalForDb.queryClient ?? createQueryClient();

if (env.NODE_ENV !== 'production') {
  globalForDb.queryClient = queryClient;
}

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
