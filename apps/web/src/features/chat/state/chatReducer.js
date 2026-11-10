import { EventType } from '@chatagent/shared';

export const initialChatState = {
  messages: [],
  isStreaming: false,
  currentStatus: null,
  activeSearches: [],
  completedSearches: [],
  currentTrace: null,
  highlightedSourceIndex: null,
  error: null
};

export function chatReducer(state, action) {
  switch (action.type) {
    case 'USER_MESSAGE_SENT': {
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: action.payload.id || crypto.randomUUID(),
            role: 'user',
            content: action.payload.content,
            created_at: new Date().toISOString()
          }
        ],
        isStreaming: true,
        currentStatus: 'Starting...',
        activeSearches: [],
        completedSearches: [],
        currentTrace: {
          model: null,
          routerReason: null,
          dateNotes: null,
          searches: [],
          timings: null
        },
        error: null
      };
    }

    case EventType.TURN_STARTED: {
      return {
        ...state,
        isStreaming: true,
        currentStatus: 'Thinking...',
        messages: [
          ...state.messages,
          {
            id: action.payload.messageId,
            role: 'assistant',
            content: '',
            sources: [],
            meta: null,
            created_at: action.payload.timestamp
          }
        ]
      };
    }

    case EventType.DATE_RESOLVED: {
      return {
        ...state,
        currentTrace: {
          ...state.currentTrace,
          dateNotes: action.payload.dateNote
        }
      };
    }

    case EventType.ROUTE_DECIDED: {
      return {
        ...state,
        currentStatus: action.payload.forceSearch ? 'Researching live sources...' : 'Formulating answer...',
        currentTrace: {
          ...state.currentTrace,
          model: action.payload.model,
          routerReason: action.payload.reason
        }
      };
    }

    case EventType.SEARCH_STARTED: {
      return {
        ...state,
        currentStatus: `Searching: "${action.payload.query}"`,
        activeSearches: [
          ...state.activeSearches,
          { searchId: action.payload.searchId, query: action.payload.query, startedAt: Date.now() }
        ]
      };
    }

    case EventType.SEARCH_FINISHED: {
      const active = state.activeSearches.filter(s => s.searchId !== action.payload.searchId);
      return {
        ...state,
        activeSearches: active,
        completedSearches: [
          ...state.completedSearches,
          { query: action.payload.query, durationMs: action.payload.durationMs }
        ],
        currentStatus: active.length > 0 ? `Searching: "${active[0].query}"` : 'Reading sources...',
        currentTrace: {
          ...state.currentTrace,
          searches: [
            ...(state.currentTrace?.searches || []),
            { query: action.payload.query, ms: action.payload.durationMs }
          ]
        }
      };
    }

    case EventType.TOKEN: {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = {
          ...last,
          content: last.content + action.payload.text
        };
      }
      return {
        ...state,
        currentStatus: 'Writing response...',
        messages: msgs
      };
    }

    case EventType.SOURCES: {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = {
          ...last,
          sources: action.payload.sources
        };
      }
      return {
        ...state,
        messages: msgs
      };
    }

    case EventType.TURN_COMPLETED: {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = {
          ...last,
          content: action.payload.text,
          sources: action.payload.sources,
          meta: action.payload.meta
        };
      }
      return {
        ...state,
        isStreaming: false,
        currentStatus: null,
        activeSearches: [],
        messages: msgs,
        currentTrace: {
          ...state.currentTrace,
          ...action.payload.meta
        }
      };
    }

    case EventType.ERROR: {
      return {
        ...state,
        isStreaming: false,
        currentStatus: null,
        activeSearches: [],
        error: action.payload.message
      };
    }

    case 'STREAM_ABORTED': {
      return {
        ...state,
        isStreaming: false,
        currentStatus: null,
        activeSearches: []
      };
    }

    case 'LOAD_SESSION_MESSAGES': {
      return {
        ...initialChatState,
        messages: action.payload.messages || []
      };
    }

    case 'HIGHLIGHT_SOURCE': {
      return {
        ...state,
        highlightedSourceIndex: action.payload.index
      };
    }

    default:
      return state;
  }
}

