import { extractTopicKeywords, selectBestBaseline, formatBaseline } from '../../../domain/recallPlanner.js';

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
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;

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

    const topic = extractTopicKeywords(query);
    const searchTerms = (topic || query).toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    for (const m of userMsgs) {
      const c = (m.content || '').toLowerCase();
      if (searchTerms.some(w => c.includes(w))) {
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
    const isVerif = /\b(change[sd]?\s+pricing|pricing\s+change[sd]?|change[sd]?\s+since|is\s+still\s+correct|any\s+update|since\s+then)\b/i.test(query);
    if (!isVerif) return null;
    const allCandidates = [];
    let primaryDate = null;
    for (const d of resolvedDates) {
      if (d.candidates && Array.isArray(d.candidates)) {
        for (const c of d.candidates) {
          if (!allCandidates.includes(c)) allCandidates.push(c);
        }
      } else if (d.iso && !allCandidates.includes(d.iso)) {
        allCandidates.push(d.iso);
      }
      if (!primaryDate && d.primaryCandidate) {
        primaryDate = d.primaryCandidate;
      }
    }

    const userMsgs = this.messages.filter(m => m.user_id === userId);
    const pairs = [];
    const bySession = new Map();
    for (const m of userMsgs) {
      if (!bySession.has(m.session_id)) bySession.set(m.session_id, []);
      bySession.get(m.session_id).push(m);
    }

    for (const [sessId, msgs] of bySession.entries()) {
      msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      for (let i = 0; i < msgs.length - 1; i++) {
        if (msgs[i].role === 'user' && msgs[i + 1].role === 'assistant') {
          const u = msgs[i];
          const a = msgs[i + 1];
          const msgDate = u.local_date || u.created_at.slice(0, 10);
          if (allCandidates.length === 0 || allCandidates.includes(msgDate)) {
            pairs.push({
              userMsg: u,
              assistantMsg: a,
              localDate: msgDate,
              sessionId: sessId
            });
          }
        }
      }
    }

    if (pairs.length === 0) return null;

    const topicKeywords = extractTopicKeywords(query);
    const best = selectBestBaseline(pairs, topicKeywords, primaryDate);
    if (!best) return null;

    return {
      baselineText: formatBaseline(best),
      chosenDate: best.localDate,
      originalQuestion: best.userMsg.content,
      originalAnswer: best.assistantMsg.content,
      reason: `Selected stored Q&A from ${best.localDate} matching "${topicKeywords}"`
    };
  }

  async getTimeline(userId) {
    const userMsgs = this.messages.filter(m => m.user_id === userId && m.role === 'user');
    const grouped = {};
    for (const m of userMsgs) {
      const d = m.local_date || (m.created_at ? m.created_at.slice(0, 10) : 'unknown');
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push({
        id: m.id,
        sessionId: m.session_id,
        content: m.content,
        createdAt: m.created_at
      });
    }
    return Object.entries(grouped)
      .map(([date, items]) => ({ date, items, count: items.length }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }
}

export { seedDemoHistory } from '../../../domain/demoSeed.js';

