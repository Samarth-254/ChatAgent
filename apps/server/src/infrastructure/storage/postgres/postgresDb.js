import pg from 'pg';
const { Pool, types } = pg;

// Parse PostgreSQL DATE (OID 1082) as raw string 'YYYY-MM-DD' instead of converting to JS Date
// This prevents UTC midnight shifts in timezones like Asia/Kolkata (GMT+05:30)
types.setTypeParser(1082, (val) => val);

export class PostgresDb {
  constructor(connectionString) {
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes('sslmode=require') || connectionString.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
      max: 10
    });
    this.type = 'neon';
  }

  async query(text, params = []) {
    const res = await this.pool.query(text, params);
    return { rows: res.rows, rowCount: res.rowCount };
  }

  async exec(sql) {
    await this.pool.query(sql);
  }

  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx = {
        query: async (text, params = []) => {
          const res = await client.query(text, params);
          return { rows: res.rows, rowCount: res.rowCount };
        },
        exec: (sql) => client.query(sql)
      };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

