/**
 * @fileoverview Ports defining the abstract boundaries between Application and Infrastructure.
 */

/**
 * @typedef {Object} ClockPort
 * @property {() => Date} getNow
 * @property {() => string} getTimezone
 * @property {(date?: Date, timeZone?: string) => string} formatClockBlock
 * @property {(date: Date, timeZone?: string) => string} formatLocalDate
 */

/**
 * @typedef {Object} LlmPort
 * @property {(params: { model: string, messages: Array<Object>, tools?: Array<Object>, tool_choice?: any, signal?: AbortSignal, reasoningEffort?: string }) => AsyncGenerator<Object, void, unknown>} streamChat
 */

/**
 * @typedef {Object} SearchPort
 * @property {(query: string|Object, options?: Object) => Promise<{ query: string, results: Array<Object>, formattedText: string, sources: Array<Object> }>} search
 */

/**
 * @typedef {Object} SessionRepositoryPort
 * @property {(userId: string) => Promise<Object>} ensureUser
 * @property {(sessionId: string, userId: string, title?: string) => Promise<Object>} createSession
 * @property {(sessionId: string, userId: string) => Promise<Object|null>} getSession
 * @property {(userId: string) => Promise<Array<Object>>} getSessions
 * @property {(sessionId: string, userId: string, title: string) => Promise<Object|null>} updateSessionTitle
 * @property {(sessionId: string, userId: string) => Promise<boolean>} deleteSession
 */

/**
 * @typedef {Object} MessageRepositoryPort
 * @property {(msg: Object) => Promise<Object>} saveMessage
 * @property {(sessionId: string, userId: string, limit?: number) => Promise<Array<Object>>} getSessionHistory
 * @property {(params: { userId: string, query?: string, resolvedDates?: Array<Object> }) => Promise<{ pastContext: string|null, hits?: Array<Object> }>} recall
 * @property {(params: { userId: string, query?: string, resolvedDates?: Array<Object> }) => Promise<{ baselineText: string, chosenDate: string, originalQuestion: string, originalAnswer: string, reason: string }|null>} findBaseline
 * @property {(userId: string) => Promise<Array<Object>>} getTimeline
 */

export {};

