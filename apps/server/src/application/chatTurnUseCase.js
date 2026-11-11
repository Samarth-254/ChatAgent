import crypto from 'crypto';
import { EventType } from '@chatagent/shared';

import { resolveRelativeDates } from '../domain/relativeDates.js';
import { routeQuery } from '../domain/queryRouter.js';
import { buildSystemPrompt } from '../domain/systemPrompt.js';
import { ToolLoop } from './toolLoop.js';

export class ChatTurnUseCase {
  /**
   * @param {Object} deps
   * @param {import('./ports/index.js').SessionRepositoryPort} deps.sessionRepository
   * @param {import('./ports/index.js').MessageRepositoryPort} deps.messageRepository
   * @param {import('./ports/index.js').LlmPort} deps.llmPort
   * @param {import('./ports/index.js').SearchPort} deps.searchPort
   * @param {import('./ports/index.js').ClockPort} deps.clockPort
   */
  constructor({
    sessionRepository,
    messageRepository,
    llmPort,
    searchPort,
    clockPort,
    fastModel = 'gemini-2.5-flash-lite',
    deepModel = 'gemini-2.5-flash-lite'
  }) {
    if (!sessionRepository || !messageRepository || !llmPort || !searchPort || !clockPort) {
      throw new Error('ChatTurnUseCase requires sessionRepository, messageRepository, llmPort, searchPort, and clockPort');
    }
    this.sessionRepo = sessionRepository;
    this.messageRepo = messageRepository;
    this.clockPort = clockPort;
    this.fastModel = fastModel;
    this.deepModel = deepModel;
    this.toolLoop = new ToolLoop({ llmPort, searchPort, fastModel });
  }

  async execute({ userId, sessionId, message, onEvent = () => {}, signal }) {
    const startTime = Date.now();
    const now = this.clockPort.getNow();
    const timeZone = this.clockPort.getTimezone();
    const todayLocalDate = this.clockPort.formatLocalDate(now, timeZone);

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    // 1. Emit instant status events (<500ms guaranteed)
    onEvent({
      type: EventType.TURN_STARTED,
      payload: { sessionId, messageId: userMsgId, timestamp: now.toISOString() }
    });
    onEvent({
      type: EventType.STATUS_UPDATE,
      payload: { step: 'thinking', message: 'Analyzing query...' }
    });

    const dateRecallStart = Date.now();

    // 2. Resolve relative dates deterministically
    const { dateNote, resolvedDates } = resolveRelativeDates(message, now, timeZone);
    onEvent({
      type: EventType.DATE_RESOLVED,
      payload: { dateNote, resolvedDates }
    });

    // 3. Fetch within-session history, memory recall, and timeline
    const recentTurns = await this.messageRepo.getSessionHistory(sessionId, userId, 12);
    const { pastContext } = await this.messageRepo.recall({ userId, query: message, resolvedDates });
    const baselineResult = await this.messageRepo.findBaseline({ userId, query: message, resolvedDates });

    let availableDates = [];
    try {
      const timeline = await this.messageRepo.getTimeline(userId);
      availableDates = (timeline || []).map(t => t.date);
    } catch {}

    const dateRecallMs = Date.now() - dateRecallStart;

    let baseline = null;
    let effectiveDateNote = dateNote;
    let baselineDate = null;

    if (baselineResult) {
      baseline = typeof baselineResult === 'string' ? baselineResult : baselineResult.baselineText;
      baselineDate = baselineResult.chosenDate;
      if (baselineResult.chosenDate) {
        resolvedDates.forEach(d => {
          d.afterDate = baselineResult.chosenDate;
          d.iso = baselineResult.chosenDate;
        });
        const candidateList = [...new Set(resolvedDates.flatMap(d => d.candidates || [d.iso]))];
        effectiveDateNote = `[date note: candidates = [${candidateList.join(', ')}]; recall picked ${baselineResult.chosenDate} (${baselineResult.reason}); "since" = after ${baselineResult.chosenDate}]`;
      }
    } else if (/\b(changed since|pricing changed|any pricing changed|since then)\b/i.test(message)) {
      const candidateList = [...new Set(resolvedDates.flatMap(d => d.candidates || [d.iso]))];
      if (candidateList.length > 0) {
        effectiveDateNote = `[date note: candidates = [${candidateList.join(', ')}]; evaluated candidates, but found no matching stored conversation. State that you have no record of discussing this topic on that date, ask the user to clarify, and run a fresh general search on current pricing.]`;
      }
    }

    // 4. Deterministic Routing
    const route = routeQuery({
      userMessage: message,
      resolvedDates,
      hasPastContext: !!pastContext,
      hasBaseline: !!baseline,
      fastModel: this.fastModel,
      deepModel: this.deepModel
    });

    if (route.reason === 'Direct historical log recall from memory' && !pastContext && resolvedDates.length > 0) {
      const askedDate = resolvedDates[0].iso || resolvedDates[0].raw;
      const datesMsg = availableDates.length > 0
        ? `Stored conversations are available for: ${availableDates.join(', ')}.`
        : `You have no stored conversations in memory.`;
      effectiveDateNote = `[date note: No records exist in memory for ${askedDate}. State clearly: "I have no record of any conversation on ${askedDate}." and note: "${datesMsg}". Never say you lack access to past conversations.]`;
    }

    onEvent({
      type: EventType.ROUTE_DECIDED,
      payload: {
        model: route.model,
        reason: route.reason,
        forceSearch: route.forceSearch,
        searchDepth: route.searchDepth,
        isDeep: route.isDeep
      }
    });

    // Ensure session exists and persist user turn
    await this.sessionRepo.createSession(sessionId, userId, message.slice(0, 36) + (message.length > 36 ? '...' : ''));
    await this.messageRepo.saveMessage({
      id: userMsgId,
      sessionId,
      userId,
      role: 'user',
      content: message,
      createdAt: now.toISOString(),
      localDate: todayLocalDate
    });

    // 5. Assemble system prompt and conversation messages
    const clockBlock = this.clockPort.formatClockBlock(now, timeZone);
    const systemContent = buildSystemPrompt({
      clockBlock,
      pastContext,
      baseline,
      dateNote: effectiveDateNote,
      availableDates
    });

    const messages = [{ role: 'system', content: systemContent }];
    for (const turn of recentTurns) {
      messages.push({ role: turn.role, content: turn.content });
    }
    const finalUserText = effectiveDateNote ? `${message}\n\n${effectiveDateNote}` : message;
    messages.push({ role: 'user', content: finalUserText });

    // 6. Run tool execution loop
    const loopResult = await this.toolLoop.run({
      currentModel: route.model,
      messages,
      route,
      signal,
      onEvent,
      baselineDate,
      startTime
    });

    const totalDuration = Date.now() - startTime;
    const finalAssistantText = loopResult.fullAssistantText || 'I processed your request, but could not produce a response.';

    const timings = {
      dateRecallMs,
      firstLlmCallMs: loopResult.timings.firstLlmCallMs,
      searchMs: loopResult.timings.searchMs,
      secondLlmCallMs: loopResult.timings.secondLlmCallMs,
      ttftMs: loopResult.ttftTime,
      totalMs: totalDuration
    };

    const meta = {
      model: loopResult.activeModel,
      routerReason: route.reason,
      dateNotes: effectiveDateNote,
      searches: loopResult.searchTraces,
      sources: loopResult.allSources,
      timings,
      searchDate: todayLocalDate
    };

    // 7. Persist assistant turn
    await this.messageRepo.saveMessage({
      id: assistantMsgId,
      sessionId,
      userId,
      role: 'assistant',
      content: finalAssistantText,
      createdAt: new Date().toISOString(),
      localDate: todayLocalDate,
      meta
    });

    onEvent({
      type: EventType.TURN_COMPLETED,
      payload: {
        messageId: assistantMsgId,
        text: finalAssistantText,
        meta
      }
    });

    return {
      id: assistantMsgId,
      text: finalAssistantText,
      meta,
      timings
    };
  }
}
