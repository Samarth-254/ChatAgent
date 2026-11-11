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
