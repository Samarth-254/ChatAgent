import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getNow, getTimezone, formatLocalDate } from './clock.js';

let dbInstance = null;

export function initDb(dbPath = process.env.DB_PATH || 'data/agent.db') {
  if (dbInstance) return dbInstance;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
      ts_utc TEXT NOT NULL, ts_local_date TEXT NOT NULL, meta_json TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(id UNINDEXED, content, tokenize = 'porter unicode61');
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(id, content) VALUES (new.id, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      DELETE FROM messages_fts WHERE id = old.id;
    END;
  `);

  dbInstance = db;
  return dbInstance;
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function createSession(id, title = 'New Conversation') {
  const db = initDb();
  const createdAt = getNow().toISOString();
  db.prepare('INSERT OR IGNORE INTO sessions (id, title, created_at) VALUES (?, ?, ?)').run(id, title, createdAt);
  return { id, title, created_at: createdAt };
}

export function getSessions() {
  const db = initDb();
  return db.prepare(`
    SELECT s.id, s.title, s.created_at, COUNT(m.id) as message_count, MAX(m.ts_utc) as last_ts
    FROM sessions s LEFT JOIN messages m ON s.id = m.session_id
    GROUP BY s.id ORDER BY COALESCE(MAX(m.ts_utc), s.created_at) DESC
  `).all();
}

export function getSession(id) {
  const db = initDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!session) return null;
  const messages = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY ts_utc ASC').all(id);
  return { ...session, messages: messages.map(m => ({ ...m, meta: m.meta_json ? JSON.parse(m.meta_json) : null })) };
}

export function deleteSession(id) {
  const db = initDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  return true;
}

export function saveMessage({ id, sessionId, role, content, tsUtc, tsLocalDate, meta = null }) {
  const db = initDb();
  createSession(sessionId);
  const now = getNow();
  const utc = tsUtc || now.toISOString();
  const localDate = tsLocalDate || formatLocalDate(now);
  const metaStr = meta ? JSON.stringify(meta) : null;

  db.prepare(`
    INSERT INTO messages (id, session_id, role, content, ts_utc, ts_local_date, meta_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, role, content, utc, localDate, metaStr);

  return { id, sessionId, role, content, ts_utc: utc, ts_local_date: localDate, meta };
}

export function getSessionHistory(sessionId, limit = 12) {
  const db = initDb();
  const rows = db.prepare(`
    SELECT * FROM (
      SELECT id, role, content, ts_utc, ts_local_date, meta_json
      FROM messages WHERE session_id = ? ORDER BY ts_utc DESC LIMIT ?
    ) ORDER BY ts_utc ASC
  `).all(sessionId, limit);

  return rows.map(r => ({
    id: r.id, role: r.role, content: r.content,
    ts_utc: r.ts_utc, ts_local_date: r.ts_local_date,
    meta: r.meta_json ? JSON.parse(r.meta_json) : null
  }));
}

function formatTurn(msg, timeZone = getTimezone()) {
  const d = new Date(msg.ts_utc);
  const weekday = d.toLocaleString('en-US', { timeZone, weekday: 'short' });
  const day = d.toLocaleString('en-US', { timeZone, day: 'numeric' });
  const month = d.toLocaleString('en-US', { timeZone, month: 'short' });
  const year = d.toLocaleString('en-US', { timeZone, year: 'numeric' });
  const time = d.toLocaleString('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
  let body = msg.content.length > 1200 ? msg.content.slice(0, 1150) + '... [truncated]' : msg.content;
  let text = `[${weekday} ${day} ${month} ${year}, ${time}] ${msg.role.toUpperCase()}: ${body}`;
  const meta = msg.meta_json ? (typeof msg.meta_json === 'string' ? JSON.parse(msg.meta_json) : msg.meta_json) : null;
  if (meta?.sources?.length) {
    const list = meta.sources.map(s => `${s.title || s.domain} (${s.domain}, pub: ${s.published_date || 'unknown'})`).join('; ');
    text += `\n  Sources used: [${list}]`;
  }
  return text;
}

export function hasPastReference(query, resolvedDates = []) {
  if (resolvedDates.some(d => d.isPast)) return true;
  return /\b(i asked|you said|earlier|last time|before|since|changed|still correct|again|shortlisted|update me|we discussed|what did i ask)\b/i.test(query);
}

export function recall({ query, resolvedDates = [] }) {
  const db = initDb();
  if (!hasPastReference(query, resolvedDates)) return { pastContext: null, foundCount: 0 };

  const collected = [];
  const seenIds = new Set();
  const timeZone = getTimezone();

  for (const dateItem of resolvedDates) {
    if (dateItem.isPast && dateItem.iso) {
      const rows = db.prepare('SELECT * FROM messages WHERE ts_local_date = ? ORDER BY ts_utc ASC').all(dateItem.iso);
      for (const row of rows) {
        if (!seenIds.has(row.id)) { seenIds.add(row.id); collected.push(row); }
      }
    }
  }

  const cleanKeywords = query.replace(/[^\w\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 3 && !['what', 'when', 'pricing', 'changed', 'since', 'asked'].includes(w.toLowerCase()))
    .slice(0, 5).join(' OR ');

  if (cleanKeywords) {
    try {
      const matches = db.prepare('SELECT m.* FROM messages_fts f JOIN messages m ON f.id = m.id WHERE messages_fts MATCH ? ORDER BY m.ts_utc DESC LIMIT 6').all(cleanKeywords);
      for (const r of matches) {
        if (!seenIds.has(r.id)) { seenIds.add(r.id); collected.push(r); }
      }
    } catch {}
  }

  if (collected.length === 0) return { pastContext: null, foundCount: 0 };
  collected.sort((a, b) => a.ts_utc.localeCompare(b.ts_utc));

  let totalChars = 0;
  const lines = [];
  for (const msg of collected) {
    const f = formatTurn(msg, timeZone);
    if (totalChars + f.length > 24000) break;
    lines.push(f);
    totalChars += f.length;
  }
  return { pastContext: `<past_context>\n${lines.join('\n\n')}\n</past_context>`, foundCount: collected.length };
}

export function findBaseline({ query, resolvedDates = [] }) {
  const db = initDb();
  const isVerif = /\b(changed since|is still correct|is your answer still correct|any update|has any pricing changed|changed pricing)\b/i.test(query);
  if (!isVerif && resolvedDates.length === 0) return null;

  let targetDate = resolvedDates.find(d => d.isPast && d.iso)?.iso;
  let userMsg = null;
  let assistantMsg = null;

  if (targetDate) {
    const rows = db.prepare('SELECT * FROM messages WHERE ts_local_date = ? ORDER BY ts_utc ASC').all(targetDate);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].role === 'user' && rows[i + 1]?.role === 'assistant') {
        userMsg = rows[i];
        assistantMsg = rows[i + 1];
        break;
      }
    }
  }

  if (!userMsg && isVerif) {
    const kw = query.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !['what', 'when', 'pricing', 'changed', 'since'].includes(w.toLowerCase())).slice(0, 4).join(' OR ');
    if (kw) {
      try {
        const match = db.prepare('SELECT m.* FROM messages_fts f JOIN messages m ON f.id = m.id WHERE messages_fts MATCH ? AND m.role = "assistant" ORDER BY m.ts_utc DESC LIMIT 1').get(kw);
        if (match) {
          assistantMsg = match;
          userMsg = db.prepare("SELECT * FROM messages WHERE session_id = ? AND ts_utc < ? AND role = 'user' ORDER BY ts_utc DESC LIMIT 1").get(match.session_id, match.ts_utc);
          targetDate = match.ts_local_date;
        }
      } catch {}
    }
  }

  if (userMsg && assistantMsg) {
    const meta = assistantMsg.meta_json ? JSON.parse(assistantMsg.meta_json) : null;
    let srcBlock = meta?.sources?.length ? '\nEarlier sources: ' + meta.sources.map(s => `${s.title} (${s.domain}, pub: ${s.published_date || 'unknown'})`).join('; ') : '';
    return `<baseline date="${targetDate}">\n[Original Question on ${targetDate}]: ${userMsg.content}\n[Original Answer on ${targetDate}]: ${assistantMsg.content}${srcBlock}\n</baseline>`;
  }
  return null;
}

export function getStoredQuestionsForDate(targetLocalDate) {
  const db = initDb();
  const timeZone = getTimezone();
  const rows = db.prepare("SELECT * FROM messages WHERE role = 'user' AND ts_local_date = ? ORDER BY ts_utc ASC").all(targetLocalDate);
  return rows.map(r => ({
    time: new Date(r.ts_utc).toLocaleString('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }),
    content: r.content,
    ts_utc: r.ts_utc
  }));
}

export function getNearestDaysWithRecords() {
  const db = initDb();
  return db.prepare('SELECT DISTINCT ts_local_date FROM messages ORDER BY ts_local_date DESC LIMIT 5').all().map(r => r.ts_local_date);
}
