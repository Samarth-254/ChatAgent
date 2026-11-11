import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { InMemorySessionRepository, InMemoryMessageRepository } from './fakes/inMemoryMemoryRepo.js';

test('MemoryPort Fake: creates sessions and stores messages', async () => {
  const sessionRepo = new InMemorySessionRepository();
  const messageRepo = new InMemoryMessageRepository(sessionRepo);

  const userId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();

  // Create session
  const session = await sessionRepo.createSession(sessionId, userId, 'CRM Shortlist');
  assert.equal(session.title, 'CRM Shortlist');

  // Save user turn
  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId,
    userId,
    role: 'user',
    content: 'We shortlisted HubSpot and Salesforce on Monday.',
    createdAt: '2026-11-09T10:00:00Z',
    localDate: '2026-11-09'
  });

  // Save assistant turn
  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId,
    userId,
    role: 'assistant',
    content: 'HubSpot is $50/mo and Salesforce is $25/mo.',
    createdAt: '2026-11-09T10:01:00Z',
    localDate: '2026-11-09',
    meta: { sources: [{ title: 'HubSpot Pricing', domain: 'hubspot.com' }] }
  });

  // Test keyword and date recall
  const { pastContext } = await messageRepo.recall({
    userId,
    query: 'What was the HubSpot pricing we discussed?',
    resolvedDates: [{ raw: 'Monday', iso: '2026-11-09', isPast: true }]
  });

  assert.ok(pastContext);
  assert.match(pastContext, /HubSpot is \$50\/mo/);

  // Test session listing
  const sessions = await sessionRepo.getSessions(userId);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].message_count, 2);

  // Test memory timeline
  const timeline = await messageRepo.getTimeline(userId);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].date, '2026-11-09');
});

test('MemoryPort: recall across two candidate days resolves to the one with matching topic', async () => {
  const sessionRepo = new InMemorySessionRepository();
  const messageRepo = new InMemoryMessageRepository(sessionRepo);

  const userId = crypto.randomUUID();

  // 1. Session on 2026-11-10 (yesterday / most recent Tuesday) with generic chit-chat
  const s1 = crypto.randomUUID();
  await sessionRepo.createSession(s1, userId, 'General Greeting');
  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId: s1,
    userId,
    role: 'user',
    content: 'Good morning, how are you today?',
    createdAt: '2026-11-10T09:00:00Z',
    localDate: '2026-11-10'
  });
  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId: s1,
    userId,
    role: 'assistant',
    content: 'Good morning! I am doing well, ready to help.',
    createdAt: '2026-11-10T09:01:00Z',
    localDate: '2026-11-10'
  });

  // 2. Session on 2026-11-03 (previous week Tuesday) with Postgres hosting discussion
  const s2 = crypto.randomUUID();
  await sessionRepo.createSession(s2, userId, 'Postgres Hosting');
  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId: s2,
    userId,
    role: 'user',
    content: 'What are the best serverless Postgres hosting providers in 2026?',
    createdAt: '2026-11-03T11:00:00Z',
    localDate: '2026-11-03'
  });
  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId: s2,
    userId,
    role: 'assistant',
    content: 'The leading serverless Postgres providers are Supabase ($25/mo Pro) and Neon ($19/mo Launch, $69/mo Scale).',
    createdAt: '2026-11-03T11:01:30Z',
    localDate: '2026-11-03',
    meta: {
      sources: [{ title: 'Neon Pricing', domain: 'neon.tech' }]
    }
  });

  // Test findBaseline with candidate dates [2026-11-03, 2026-11-10]
  const baseline = await messageRepo.findBaseline({
    userId,
    query: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
    resolvedDates: [{
      raw: 'last Tuesday',
      iso: '2026-11-03',
      candidates: ['2026-11-03', '2026-11-10'],
      primaryCandidate: '2026-11-03'
    }]
  });

  assert.ok(baseline, 'Baseline must be found');
  assert.equal(baseline.chosenDate, '2026-11-03', 'Must select 2026-11-03 due to Postgres hosting topic match');
  assert.match(baseline.originalAnswer, /Supabase.*Neon/);
  assert.match(baseline.reason, /Postgres hosting/i);
});
