import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { EventType } from '@chatagent/shared';

import { InMemorySessionRepository, InMemoryMessageRepository } from './fakes/inMemoryMemoryRepo.js';
import { fakeStreamChat } from './fakes/fakeLlm.js';
import { fakeSearch } from './fakes/fakeSearch.js';
import { ToolLoop } from '../src/application/toolLoop.js';
import { ChatTurnUseCase } from '../src/application/chatTurnUseCase.js';

const mockClock = {
  getNow: () => new Date('2026-11-10T09:00:00+05:30'),
  getTimezone: () => 'Asia/Kolkata',
  formatClockBlock: () => 'Today is Tuesday, 10 November 2026.',
  formatLocalDate: () => '2026-11-10'
};

test('ToolLoop: executes multi-search tool loop in parallel and emits lifecycle events', async () => {
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
    llmPort: { streamChat: fakeStreamChat },
    searchPort: { search: fakeSearch },
    clockPort: mockClock
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
  assert.ok(eventTypes.includes(EventType.STATUS_UPDATE));
  assert.ok(eventTypes.includes(EventType.DATE_RESOLVED));
  assert.ok(eventTypes.includes(EventType.ROUTE_DECIDED));
  assert.ok(eventTypes.includes(EventType.SEARCH_STARTED));
  assert.ok(eventTypes.includes(EventType.TOKEN));
  assert.ok(eventTypes.includes(EventType.TURN_COMPLETED));

  // Verify search traces and answer
  assert.ok(res.meta.searches.length > 0, 'Should have executed searches');
  assert.ok(res.text.includes('Changed since 9 November 2026') || res.text.includes('HubSpot'));
  assert.ok(res.meta.timings.totalMs >= 0);
  assert.ok(res.meta.timings.dateRecallMs >= 0);
});

test('ToolLoop: step cap enforces max rounds limit', async () => {
  let roundCount = 0;
  // Infinite tool calling fake LLM
  const infiniteToolLlm = {
    async *streamChat() {
      roundCount++;
      yield {
        type: 'tool_calls',
        toolCalls: [{ id: `call_${roundCount}`, name: 'web_search', arguments: { query: 'test query' } }]
      };
      yield { type: 'finish_reason', finishReason: 'tool_calls' };
    }
  };

  const toolLoop = new ToolLoop({
    llmPort: infiniteToolLlm,
    searchPort: { search: async () => ({ results: [], formattedText: 'ok', sources: [] }) }
  });

  const res = await toolLoop.run({
    currentModel: 'test-model',
    messages: [{ role: 'user', content: 'test' }],
    route: { forceSearch: true, searchDepth: 'basic' },
    onEvent: () => {},
    maxRounds: 3
  });

  assert.equal(roundCount, 3, 'Must stop at maxRounds (3)');
  assert.ok(res);
});

test('ToolLoop: handles search failure gracefully without crashing turn', async () => {
  const failingSearch = {
    search: async () => {
      throw new Error('Tavily network timeout');
    }
  };

  let toolResultReceived = null;
  const singleToolLlm = {
    async *streamChat({ messages }) {
      const toolMsg = messages.find(m => m.role === 'tool');
      if (!toolMsg) {
        yield {
          type: 'tool_calls',
          toolCalls: [{ id: 'c1', name: 'web_search', arguments: { query: 'failing query' } }]
        };
      } else {
        toolResultReceived = toolMsg.content;
        yield { type: 'text_delta', text: 'Search failed but turn completed.' };
      }
    }
  };

  const toolLoop = new ToolLoop({
    llmPort: singleToolLlm,
    searchPort: failingSearch
  });

  const res = await toolLoop.run({
    currentModel: 'test-model',
    messages: [{ role: 'user', content: 'test' }],
    route: { forceSearch: true, searchDepth: 'basic' },
    onEvent: () => {}
  });

  assert.ok(toolResultReceived);
  assert.match(toolResultReceived, /Search failed: Tavily network timeout/);
  assert.equal(res.fullAssistantText, 'Search failed but turn completed.');
});

test('ToolLoop: abort signal halts execution cleanly', async () => {
  const controller = new AbortController();
  controller.abort(); // Pre-aborted

  const toolLoop = new ToolLoop({
    llmPort: { async *streamChat() { yield { type: 'text_delta', text: 'hi' }; } },
    searchPort: { search: async () => ({ results: [], formattedText: '', sources: [] }) }
  });

  await assert.rejects(
    async () => {
      await toolLoop.run({
        currentModel: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
        route: { forceSearch: false, searchDepth: 'basic' },
        signal: controller.signal,
        onEvent: () => {}
      });
    },
    /Request aborted by user/
  );
});
