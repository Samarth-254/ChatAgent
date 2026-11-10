import { describe, it, expect } from 'vitest';
import { EventType } from '@chatagent/shared';
import { chatReducer, initialChatState } from '../features/chat/state/chatReducer.js';

describe('chatReducer', () => {
  it('appends user message on USER_MESSAGE_SENT', () => {
    const state = chatReducer(initialChatState, {
      type: 'USER_MESSAGE_SENT',
      payload: { content: 'Compare Linear vs Jira' }
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe('user');
    expect(state.messages[0].content).toBe('Compare Linear vs Jira');
    expect(state.isStreaming).toBe(true);
  });

  it('accumulates streamed tokens', () => {
    let state = chatReducer(initialChatState, {
      type: EventType.TURN_STARTED,
      payload: { messageId: 'm1', timestamp: '2026-11-10T10:00:00Z' }
    });

    state = chatReducer(state, {
      type: EventType.TOKEN,
      payload: { text: 'Hello ' }
    });

    state = chatReducer(state, {
      type: EventType.TOKEN,
      payload: { text: 'world!' }
    });

    expect(state.messages[0].content).toBe('Hello world!');
  });

  it('tracks search status chips and finishes turn', () => {
    let state = chatReducer(initialChatState, {
      type: EventType.TURN_STARTED,
      payload: { messageId: 'm1', timestamp: '2026-11-10T10:00:00Z' }
    });

    state = chatReducer(state, {
      type: EventType.SEARCH_STARTED,
      payload: { searchId: 's1', query: 'HubSpot pricing' }
    });
    expect(state.activeSearches).toHaveLength(1);

    state = chatReducer(state, {
      type: EventType.SEARCH_FINISHED,
      payload: { searchId: 's1', query: 'HubSpot pricing', durationMs: 120 }
    });
    expect(state.activeSearches).toHaveLength(0);
    expect(state.completedSearches).toHaveLength(1);

    state = chatReducer(state, {
      type: EventType.TURN_COMPLETED,
      payload: {
        messageId: 'm1',
        text: 'HubSpot is $50.',
        sources: [{ url: 'https://hubspot.com', title: 'Pricing' }],
        meta: { model: 'gemini-2.5-flash' }
      }
    });

    expect(state.isStreaming).toBe(false);
    expect(state.messages[0].sources).toHaveLength(1);
  });
});

