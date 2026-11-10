import { PostgresDb } from './postgresDb.js';
import { PGliteDb } from './pgliteDb.js';

let activeDb = null;

export function createDb({ databaseUrl = process.env.DATABASE_URL, dataDir = 'data/pglite' } = {}) {
  if (databaseUrl && databaseUrl.trim().length > 0) {
    return new PostgresDb(databaseUrl.trim());
  }
  return new PGliteDb(dataDir);
}

export function getDb() {
  if (!activeDb) {
    activeDb = createDb();
  }
  return activeDb;
}

export function setDb(db) {
  activeDb = db;
}

