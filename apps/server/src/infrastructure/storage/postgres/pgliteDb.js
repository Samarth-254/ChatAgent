import { PGlite } from '@electric-sql/pglite';
import path from 'path';
import fs from 'fs';

export class PGliteDb {
  constructor(dataDir = null) {
    this.dataDir = dataDir;
    this.type = 'pglite';
    this.instance = null;
  }

  async init() {
    if (this.instance) return;
    if (this.dataDir && this.dataDir !== ':memory:') {
      const dir = path.resolve(this.dataDir);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      this.instance = new PGlite(dir);
    } else {
      this.instance = new PGlite();
    }
    await this.instance.waitReady;
  }

  async query(text, params = []) {
    await this.init();
    const res = await this.instance.query(text, params);
    return { rows: res.rows || [], rowCount: (res.rows || []).length };
  }

  async exec(sql) {
    await this.init();
    await this.instance.exec(sql);
  }

  async transaction(fn) {
    await this.init();
    return this.instance.transaction(async (tx) => {
      const wrapper = {
        query: async (text, params = []) => {
          const res = await tx.query(text, params);
          return { rows: res.rows || [], rowCount: (res.rows || []).length };
        },
        exec: (sql) => tx.exec(sql)
      };
      return fn(wrapper);
    });
  }

  async close() {
    if (this.instance) {
      await this.instance.close();
      this.instance = null;
    }
  }
}

