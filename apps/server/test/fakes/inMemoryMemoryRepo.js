export class InMemorySessionRepository {
  constructor() {
    this.users = new Set();
    this.sessions = new Map();
  }

  async ensureUser(userId) {
    this.users.add(userId);
    return { id: userId };
  }

  async createSession(sessionId, userId, title = 'New Conversation') {
    await this.ensureUser(userId);
    const session = {
      id: sessionId,
      user_id: userId,
      title,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: 0
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  async getSession(sessionId, userId) {
    const s = this.sessions.get(sessionId);
    if (!s || s.user_id !== userId) return null;
    return s;
  }

  async getSessions(userId) {
    return Array.from(this.sessions.values())
      .filter(s => s.user_id === userId)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }

  async updateSessionTitle(sessionId, userId, title) {
    const s = await this.getSession(sessionId, userId);
    if (!s) return null;
    s.title = title;
    s.updated_at = new Date().toISOString();
    return s;
  }

  async deleteSession(sessionId, userId) {
    const s = await this.getSession(sessionId, userId);
    if (!s) return false;
    this.sessions.delete(sessionId);
    return true;
  }
}

export class InMemoryMessageRepository {
  constructor(sessionRepo = null) {
    this.messages = [];
    this.sessionRepo = sessionRepo;
  }

  async saveMessage({ id, sessionId, userId, role, content, createdAt, localDate, meta = {} }) {
    const msg = {
      id,
      session_id: sessionId,
      user_id: userId,
      role,
      content,
      created_at: createdAt || new Date().toISOString(),
      local_date: localDate || new Date().toISOString().slice(0, 10),
      meta
    };
    this.messages.push(msg);

    if (this.sessionRepo) {
      const s = this.sessionRepo.sessions.get(sessionId);
      if (s) {
        s.message_count = (s.message_count || 0) + 1;
        s.updated_at = msg.created_at;
      }
    }
    return msg;
  }

  async getSessionHistory(sessionId, userId, limit = 12) {
    return this.messages
      .filter(m => m.session_id === sessionId && m.user_id === userId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(-limit);
  }

  async recall({ userId, query = '', resolvedDates = [] }) {
    const userMsgs = this.messages.filter(m => m.user_id === userId);
    const dateMatches = [];
    const keywordMatches = [];

    const pastDates = resolvedDates.filter(d => d.isPast).map(d => d.iso);
    if (pastDates.length > 0) {
      for (const m of userMsgs) {
        if (pastDates.includes(m.local_date)) {
          dateMatches.push(m);
        }
      }
    }

    const qWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    for (const m of userMsgs) {
      const c = (m.content || '').toLowerCase();
      if (qWords.some(w => c.includes(w))) {
        keywordMatches.push(m);
      }
    }

    const combined = [...new Set([...dateMatches, ...keywordMatches])];
    if (combined.length === 0) return { pastContext: null, hits: [] };

    const grouped = {};
    for (const m of combined) {
      if (!grouped[m.local_date]) grouped[m.local_date] = [];
      grouped[m.local_date].push(`${m.role.toUpperCase()}: ${m.content}`);
    }

    const sections = Object.entries(grouped).map(([date, turns]) => `=== Memory Log for ${date} ===\n${turns.join('\n')}`);
    return { pastContext: sections.join('\n\n'), hits: combined };
  }

  async findBaseline({ userId, query = '', resolvedDates = [] }) {
    const { hits } = await this.recall({ userId, query, resolvedDates });
    const assistantTurns = hits.filter(m => m.role === 'assistant');
    if (assistantTurns.length === 0) return null;
    const latest = assistantTurns[assistantTurns.length - 1];
    return {
      content: latest.content,
      date: latest.local_date,
      sources: latest.meta?.sources || [],
      searches: latest.meta?.searches || []
    };
  }

  async getTimeline(userId) {
    const userMsgs = this.messages
      .filter(m => m.user_id === userId && m.role === 'user')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const grouped = {};
    for (const m of userMsgs) {
      if (!grouped[m.local_date]) grouped[m.local_date] = [];
      grouped[m.local_date].push({
        id: m.id,
        sessionId: m.session_id,
        question: m.content,
        timestamp: m.created_at
      });
    }

    return Object.entries(grouped).map(([date, questions]) => ({
      date,
      questions
    }));
  }
}
