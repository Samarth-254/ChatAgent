function formatTurn(msg) {
  const d = new Date(msg.created_at);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const day = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  let body = msg.content.length > 1200 ? msg.content.slice(0, 1150) + '... [truncated]' : msg.content;
  let text = `[${weekday} ${day}, ${time}] ${msg.role.toUpperCase()}: ${body}`;
  const meta = typeof msg.meta === 'string' ? JSON.parse(msg.meta) : msg.meta;
  if (meta?.sources?.length) {
    const list = meta.sources.map(s => `${s.title || s.domain} (${s.domain}, pub: ${s.publishedDate || s.published_date || 'unknown'})`).join('; ');
    text += `\n  Sources used: [${list}]`;
  }
  return text;
}

export class PostgresMessageRepository {
  /**
   * @param {Object} db - Unified Db interface
   */
  constructor(db) {
    this.db = db;
  }

  async saveMessage({ id, sessionId, userId, role, content, createdAt, localDate, meta = {} }) {
    const metaJson = typeof meta === 'string' ? meta : JSON.stringify(meta);
    const { rows } = await this.db.query(
      `INSERT INTO messages (id, session_id, user_id, role, content, created_at, local_date, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, session_id, user_id, role, content, created_at, local_date, meta`,
      [id, sessionId, userId, role, content, createdAt, localDate, metaJson]
    );

    // Update parent session updated_at
    await this.db.query('UPDATE sessions SET updated_at = NOW() WHERE id = $1', [sessionId]);
    return rows[0];
  }

  async getSessionHistory(sessionId, userId, limit = 12) {
    const { rows } = await this.db.query(
      `SELECT * FROM (
         SELECT id, session_id, user_id, role, content, created_at, local_date, meta
         FROM messages
         WHERE session_id = $1 AND user_id = $2
         ORDER BY created_at DESC
         LIMIT $3
       ) sub
       ORDER BY created_at ASC`,
      [sessionId, userId, limit]
    );
    return rows;
  }

  async recall({ userId, query, resolvedDates = [] }) {
    const collected = [];
    const seenIds = new Set();

    // 1. Gather messages for resolved past dates
    for (const d of resolvedDates) {
      if (d.isPast && d.iso) {
        const { rows } = await this.db.query(
          `SELECT * FROM messages
           WHERE user_id = $1 AND local_date = $2
           ORDER BY created_at ASC`,
          [userId, d.iso]
        );
        for (const r of rows) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            collected.push(r);
          }
        }
      }
    }

    // 2. Full-text search using websearch_to_tsquery and ts_rank
    const cleanQuery = query.replace(/[^\w\s]/g, ' ').trim();
    if (cleanQuery) {
      try {
        const { rows } = await this.db.query(
          `SELECT *, ts_rank(content_tsv, websearch_to_tsquery('english', $2)) AS rank
           FROM messages
           WHERE user_id = $1 AND content_tsv @@ websearch_to_tsquery('english', $2)
           ORDER BY rank DESC, created_at DESC
           LIMIT 6`,
          [userId, cleanQuery]
        );
        for (const r of rows) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            collected.push(r);
          }
        }
      } catch {
        // Fallback or ignore syntax errors in query
      }
    }

    if (collected.length === 0) return { pastContext: null, foundCount: 0 };
    collected.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    let totalChars = 0;
    const lines = [];
    for (const m of collected) {
      const formatted = formatTurn(m);
      if (totalChars + formatted.length > 24000) break;
      lines.push(formatted);
      totalChars += formatted.length;
    }

    return {
      pastContext: `<past_context>\n${lines.join('\n\n')}\n</past_context>`,
      foundCount: collected.length
    };
  }

  async findBaseline({ userId, query, resolvedDates = [] }) {
    const isVerif = /\b(changed since|is still correct|is your answer still correct|any update|has any pricing changed|changed pricing)\b/i.test(query);
    if (!isVerif && resolvedDates.length === 0) return null;

    let targetDate = resolvedDates.find(d => d.isPast && d.iso)?.iso;
    let userMsg = null;
    let assistantMsg = null;

    if (targetDate) {
      const { rows } = await this.db.query(
        `SELECT * FROM messages
         WHERE user_id = $1 AND local_date = $2
         ORDER BY created_at ASC`,
        [userId, targetDate]
      );
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].role === 'user' && rows[i + 1]?.role === 'assistant') {
          userMsg = rows[i];
          assistantMsg = rows[i + 1];
          break;
        }
      }
    }

    if (!userMsg && isVerif) {
      const clean = query.replace(/[^\w\s]/g, ' ').trim();
      if (clean) {
        try {
          const { rows } = await this.db.query(
            `SELECT * FROM messages
             WHERE user_id = $1 AND role = 'assistant' AND content_tsv @@ websearch_to_tsquery('english', $2)
             ORDER BY created_at DESC LIMIT 1`,
            [userId, clean]
          );
          if (rows.length > 0) {
            assistantMsg = rows[0];
            const uRes = await this.db.query(
              `SELECT * FROM messages
               WHERE session_id = $1 AND created_at < $2 AND role = 'user'
               ORDER BY created_at DESC LIMIT 1`,
              [assistantMsg.session_id, assistantMsg.created_at]
            );
            userMsg = uRes.rows[0] || null;
            targetDate = assistantMsg.local_date;
          }
        } catch {}
      }
    }

    if (userMsg && assistantMsg) {
      const meta = typeof assistantMsg.meta === 'string' ? JSON.parse(assistantMsg.meta) : assistantMsg.meta;
      let srcBlock = meta?.sources?.length
        ? '\nEarlier sources: ' + meta.sources.map(s => `${s.title} (${s.domain}, pub: ${s.publishedDate || s.published_date || 'unknown'})`).join('; ')
        : '';
      return `<baseline date="${targetDate}">\n[Original Question on ${targetDate}]: ${userMsg.content}\n[Original Answer on ${targetDate}]: ${assistantMsg.content}${srcBlock}\n</baseline>`;
    }
    return null;
  }

  async getTimeline(userId) {
    const { rows } = await this.db.query(
      `SELECT local_date, id, session_id, content, created_at
       FROM messages
       WHERE user_id = $1 AND role = 'user'
       ORDER BY local_date DESC, created_at DESC`,
      [userId]
    );

    // Group by local_date
    const grouped = {};
    for (const r of rows) {
      const key = r.local_date instanceof Date ? r.local_date.toISOString().slice(0, 10) : String(r.local_date);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({
        id: r.id,
        sessionId: r.session_id,
        content: r.content,
        createdAt: r.created_at
      });
    }

    return Object.entries(grouped).map(([date, items]) => ({
      date,
      items
    }));
  }
}

