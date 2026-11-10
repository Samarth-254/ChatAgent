export class PostgresSessionRepository {
  /**
   * @param {Object} db - Unified Db interface
   */
  constructor(db) {
    this.db = db;
  }

  async ensureUser(userId) {
    await this.db.query(
      'INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [userId]
    );
  }

  async createSession(id, userId, title = 'New Conversation') {
    await this.ensureUser(userId);
    const { rows } = await this.db.query(
      `INSERT INTO sessions (id, user_id, title)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
       RETURNING id, user_id, title, created_at, updated_at`,
      [id, userId, title]
    );
    return rows[0];
  }

  async getSessions(userId) {
    await this.ensureUser(userId);
    const { rows } = await this.db.query(
      `SELECT s.id, s.title, s.created_at, s.updated_at,
              COUNT(m.id)::int AS message_count,
              MAX(m.created_at) AS last_ts
       FROM sessions s
       LEFT JOIN messages m ON s.id = m.session_id
       WHERE s.user_id = $1
       GROUP BY s.id
       ORDER BY s.updated_at DESC`,
      [userId]
    );
    return rows;
  }

  async getSession(id, userId) {
    await this.ensureUser(userId);
    const sessionRes = await this.db.query(
      'SELECT * FROM sessions WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (sessionRes.rows.length === 0) return null;

    const messagesRes = await this.db.query(
      `SELECT id, session_id, user_id, role, content, created_at, local_date, meta
       FROM messages
       WHERE session_id = $1 AND user_id = $2
       ORDER BY created_at ASC`,
      [id, userId]
    );

    return {
      ...sessionRes.rows[0],
      messages: messagesRes.rows
    };
  }

  async renameSession(id, userId, title) {
    const { rows } = await this.db.query(
      `UPDATE sessions
       SET title = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [title, id, userId]
    );
    return rows[0] || null;
  }

  async deleteSession(id, userId) {
    const { rowCount } = await this.db.query(
      'DELETE FROM sessions WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return rowCount > 0;
  }
}

