import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Run Drizzle migrations against the database.
 *
 * Usage: pnpm db:migrate
 *
 * Uses DATABASE_URL_UNPOOLED (direct connection) for DDL operations
 * since pgbouncer in transaction mode doesn't support migrations.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('DATABASE_URL or DATABASE_URL_UNPOOLED must be set');
    process.exit(1);
  }

  const connection = postgres(connectionString, { max: 1 });
  const db = drizzle(connection);

  console.info('Running migrations...');

  await migrate(db, { migrationsFolder: './drizzle/migrations' });

  console.info('Migrations complete.');

  await connection.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
