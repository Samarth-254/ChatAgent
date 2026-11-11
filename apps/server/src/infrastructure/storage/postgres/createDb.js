import { PostgresDb } from './postgresDb.js';
import { config } from '../../../config/index.js';

let activeDb = null;

export function createDb({ databaseUrl = config.databaseUrl } = {}) {
  const url = databaseUrl || config.databaseUrl;
  if (!url || url.trim().length === 0) {
    throw new Error('[Storage] Missing required DATABASE_URL. A valid Neon PostgreSQL connection string is required.');
  }
  return new PostgresDb(url.trim());
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
