import 'dotenv/config';
import { getDb } from '../src/infrastructure/storage/postgres/createDb.js';
import { runMigrations } from '../src/infrastructure/storage/postgres/migrationRunner.js';

async function main() {
  const db = getDb();
  console.log(`[Migrations] Running database migrations on ${db.type}...`);
  try {
    await runMigrations(db);
    console.log('[Migrations] All migrations up to date.');
  } finally {
    await db.close();
  }
}

main().catch(err => {
  console.error('[Migrations] Migration failed:', err);
  process.exit(1);
});

