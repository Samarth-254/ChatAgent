import { extractTopicKeywords, selectBestBaseline, formatBaseline } from '../../src/domain/recallPlanner.js';

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

    const topicKeywords = extractTopicKeywords(query);
    const userMsgs = this.messages.filter(m => m.user_id === userId);
    const candidatePairs = [];

    for (let i = 0; i < userMsgs.length; i++) {
      if (userMsgs[i].role === 'user' && userMsgs[i + 1]?.role === 'assistant') {
        const u = userMsgs[i];
        const a = userMsgs[i + 1];
        if (allCandidates.length === 0 || allCandidates.includes(u.local_date)) {
          candidatePairs.push({
            userMsg: u,
            assistantMsg: a,
            localDate: u.local_date
          });
        }
        i++;
      }
    }

    const bestPair = selectBestBaseline(candidatePairs, topicKeywords, primaryDate);
    if (bestPair) {
      return {
        baselineText: formatBaseline(bestPair),
        chosenDate: bestPair.localDate,
        originalQuestion: bestPair.userMsg.content,
        originalAnswer: bestPair.assistantMsg.content,
        reason: `Matched stored conversation on ${bestPair.localDate} regarding "${topicKeywords || 'topic'}"`
      };
    }
    return null;
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

