/**
 * SSE Event Type Constants
 * @readonly
 * @enum {string}
 */
export const EventType = {
  TURN_STARTED: 'turn.started',
  ROUTE_DECIDED: 'route.decided',
  DATE_RESOLVED: 'date.resolved',
  SEARCH_STARTED: 'search.started',
  SEARCH_FINISHED: 'search.finished',
  TOKEN: 'token',
  SOURCES: 'sources',
  TURN_COMPLETED: 'turn.completed',
  ERROR: 'error'
};

/**
 * @typedef {Object} TurnStartedPayload
 * @property {string} sessionId
 * @property {string} messageId
 * @property {string} timestamp
 */

/**
 * @typedef {Object} RouteDecidedPayload
 * @property {string} model
 * @property {string} reason
 * @property {boolean} forceSearch
 * @property {string} searchDepth
 * @property {boolean} isDeep
 */

/**
 * @typedef {Object} ResolvedDateItem
 * @property {string} raw
 * @property {string} iso
 * @property {string|null} afterDate
 * @property {boolean} isPast
 */

/**
 * @typedef {Object} DateResolvedPayload
 * @property {string|null} dateNote
 * @property {ResolvedDateItem[]} resolvedDates
 */

/**
 * @typedef {Object} SearchStartedPayload
 * @property {string} searchId
 * @property {string} query
 * @property {string} [afterDate]
 * @property {string[]} [domains]
 */

/**
 * @typedef {Object} SearchFinishedPayload
 * @property {string} searchId
 * @property {string} query
 * @property {number} durationMs
 * @property {number} resultCount
 */

/**
 * @typedef {Object} TokenPayload
 * @property {string} text
 */

/**
 * @typedef {Object} SourceItem
 * @property {string} url
 * @property {string} title
 * @property {string} domain
 * @property {'official'|'news'|'review'|'other'} type
 * @property {string|null} publishedDate
 */

/**
 * @typedef {Object} SourcesPayload
 * @property {SourceItem[]} sources
 */

/**
 * @typedef {Object} SearchTraceItem
 * @property {string} query
 * @property {string} topic
 * @property {string|null} afterDate
 * @property {number} ms
 */

/**
 * @typedef {Object} TurnCompletedPayload
 * @property {string} messageId
 * @property {string} text
 * @property {SourceItem[]} sources
 * @property {Object} meta
 * @property {string} meta.model
 * @property {string} meta.routerReason
 * @property {string|null} meta.dateNotes
 * @property {SearchTraceItem[]} meta.searches
 * @property {SourceItem[]} meta.sources
 * @property {string} meta.searchDate
 * @property {{ ttftMs: number, totalMs: number }} meta.timings
 * @property {string|null} [meta.recallSummary]
 */

/**
 * @typedef {Object} ErrorPayload
 * @property {string} message
 * @property {string} [code]
 */

