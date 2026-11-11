import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { EventType } from '@chatagent/shared';

import { InMemorySessionRepository, InMemoryMessageRepository } from './fakes/inMemoryMemoryRepo.js';
import { fakeStreamChat } from './fakes/fakeLlm.js';
import { fakeSearch } from './fakes/fakeSearch.js';
import { ChatTurnUseCase } from '../src/application/chatTurnUseCase.js';

test('ToolLoop: executes multi-search tool loop and emits lifecycle events', async () => {
  const sessionRepo = new InMemorySessionRepository();
  const messageRepo = new InMemoryMessageRepository(sessionRepo);

  const userId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  await sessionRepo.createSession(sessionId, userId, 'Tool Loop Test');

  // Seed prior Monday turn
  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId,
    userId,
    role: 'user',
    content: 'On Monday we shortlisted HubSpot, Pipedrive, and Zoho CRM.',
    createdAt: '2026-11-09T10:00:00+05:30',
    localDate: '2026-11-09'
  });
  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId,
    userId,
    role: 'assistant',
    content: 'HubSpot is $50/mo, Pipedrive is $24/mo, Zoho CRM is $20/mo.',
    createdAt: '2026-11-09T10:01:00+05:30',
    localDate: '2026-11-09',
    meta: {
      sources: [{ url: 'https://hubspot.com/pricing', title: 'HubSpot', domain: 'hubspot.com' }]
    }
  });

  const useCase = new ChatTurnUseCase({
    sessionRepository: sessionRepo,
    messageRepository: messageRepo,
    llmStream: fakeStreamChat,
    searchFn: fakeSearch
  });

  const events = [];
  const res = await useCase.execute({
    userId,
    sessionId,
    message: 'On Monday we shortlisted 5 CRM tools. Has any of them changed pricing or shipped something big since?',
    onEvent: (e) => events.push(e)
  });

  // Verify lifecycle events
  const eventTypes = events.map(e => e.type);
  assert.ok(eventTypes.includes(EventType.TURN_STARTED));
  assert.ok(eventTypes.includes(EventType.DATE_RESOLVED));
  assert.ok(eventTypes.includes(EventType.ROUTE_DECIDED));
  assert.ok(eventTypes.includes(EventType.SEARCH_STARTED));
  assert.ok(eventTypes.includes(EventType.TOKEN));
  assert.ok(eventTypes.includes(EventType.TURN_COMPLETED));

  // Verify search traces and answer
  assert.ok(res.meta.searches.length > 0, 'Should have executed searches');
  assert.ok(res.text.includes('Changed since 9 November 2026') || res.text.includes('HubSpot'));
  assert.ok(res.meta.timings.totalMs >= 0);
});
