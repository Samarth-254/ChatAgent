import crypto from 'crypto';
import { EventType } from '@chatagent/shared';
import { resolveRelativeDates, getNow, formatLocalDate, formatClockBlock } from '../infrastructure/clock/clock.js';
import { routeQuery } from './router.js';
import { buildSystemPrompt, WEB_SEARCH_TOOL } from './prompts.js';
import { streamChat } from '../infrastructure/llm/llm.js';
import { search } from '../infrastructure/search/search.js';

export class ChatTurnUseCase {
  constructor({ sessionRepository, messageRepository }) {
    this.sessionRepo = sessionRepository;
    this.messageRepo = messageRepository;
  }

  async execute({ userId, sessionId, message, onEvent, signal }) {
    const startTime = Date.now();
    const now = getNow();
    const todayLocalDate = formatLocalDate(now);
    let ttftTime = null;

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    onEvent({
      type: EventType.TURN_STARTED,
      payload: { sessionId, messageId: userMsgId, timestamp: now.toISOString() }
    });

    // 1. Resolve relative dates deterministically
    const { textWithNote, dateNote, resolvedDates } = resolveRelativeDates(message, now);
    onEvent({
      type: EventType.DATE_RESOLVED,
      payload: { dateNote, resolvedDates }
    });

    // 2. Fetch within-session history and memory recall
    const recentTurns = await this.messageRepo.getSessionHistory(sessionId, userId, 12);
    const { pastContext } = await this.messageRepo.recall({ userId, query: message, resolvedDates });
    const baseline = await this.messageRepo.findBaseline({ userId, query: message, resolvedDates });

    // 3. Routing
    const route = routeQuery({
      userMessage: message,
      resolvedDates,
      hasPastContext: !!pastContext,
      hasBaseline: !!baseline
    });

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

    // Ensure session exists
    await this.sessionRepo.createSession(sessionId, userId, message.slice(0, 36) + (message.length > 36 ? '...' : ''));

    // Save incoming user message
    await this.messageRepo.saveMessage({
      id: userMsgId,
      sessionId,
      userId,
      role: 'user',
      content: message,
      createdAt: now.toISOString(),
      localDate: todayLocalDate
    });

    // 4. Assemble system prompt and conversation messages
    const clockBlock = formatClockBlock(now);
    const systemContent = buildSystemPrompt({
      clockBlock,
      pastContext,
      baseline,
      dateNote
    });

    const messages = [{ role: 'system', content: systemContent }];
    for (const turn of recentTurns) {
      messages.push({ role: turn.role, content: turn.content });
    }
    messages.push({ role: 'user', content: textWithNote });

    // 5. Tool execution loop
    let currentModel = route.model;
    const maxRounds = 4;
    let round = 0;
    let fullAssistantText = '';
    const allSources = [];
    const searchTraces = [];

    while (round < maxRounds) {
      round++;
      const isFirstRound = round === 1;
      const forceThisRound = isFirstRound && route.forceSearch;
      const toolChoice = forceThisRound ? { type: 'function', function: { name: 'web_search' } } : 'auto';

      let currentRoundCalls = null;
      const stream = streamChat({
        model: currentModel,
        messages,
        tools: [WEB_SEARCH_TOOL],
        tool_choice: toolChoice,
        signal
      });

      for await (const event of stream) {
        if (signal?.aborted) throw new Error('Request aborted by user');

        if (event.type === 'fallback') {
          currentModel = event.model;
        } else if (event.type === 'text_delta') {
          if (ttftTime === null) ttftTime = Date.now() - startTime;
          fullAssistantText += event.text;
          onEvent({
            type: EventType.TOKEN,
            payload: { text: event.text }
          });
        } else if (event.type === 'tool_calls') {
          currentRoundCalls = event.toolCalls;
        }
      }

      if (!currentRoundCalls || currentRoundCalls.length === 0) break;

      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: currentRoundCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.rawArguments || JSON.stringify(tc.arguments) }
        }))
      });

      // Execute tool calls in parallel
      const toolExecutions = currentRoundCalls.map(async (tc) => {
        const args = tc.arguments || {};
        const q = args.query || '';
        const searchId = `srch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const sStart = Date.now();

        onEvent({
          type: EventType.SEARCH_STARTED,
          payload: { searchId, query: q, afterDate: args.after_date, domains: args.domains }
        });

        const searchRes = await search(q, {
          topic: args.topic || 'general',
          after_date: args.after_date || null,
          before_date: args.before_date || null,
          domains: args.domains || [],
          search_depth: route.searchDepth
        });

        const sDuration = Date.now() - sStart;
        searchTraces.push({ query: q, topic: args.topic || 'general', afterDate: args.after_date || null, ms: sDuration });

        onEvent({
          type: EventType.SEARCH_FINISHED,
          payload: { searchId, query: q, durationMs: sDuration, resultCount: searchRes.results?.length || 0 }
        });

        if (searchRes.sources?.length) {
          for (const s of searchRes.sources) {
            if (!allSources.some(existing => existing.url === s.url)) {
              allSources.push(s);
            }
          }
          onEvent({
            type: EventType.SOURCES,
            payload: { sources: allSources }
          });
        }

        return {
          role: 'tool',
          tool_call_id: tc.id,
          content: searchRes.formattedText
        };
      });

      const toolResponses = await Promise.all(toolExecutions);
      for (const tr of toolResponses) messages.push(tr);

      if (round === maxRounds) {
        messages.push({
          role: 'system',
          content: 'Search budget limit reached. Provide your final answer immediately. State clearly if any points could not be verified.'
        });
        const finalStream = streamChat({ model: currentModel, messages, tools: undefined, signal });
        for await (const event of finalStream) {
          if (event.type === 'text_delta') {
            if (ttftTime === null) ttftTime = Date.now() - startTime;
            fullAssistantText += event.text;
            onEvent({ type: EventType.TOKEN, payload: { text: event.text } });
          }
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const meta = {
      model: currentModel,
      routerReason: route.reason,
      dateNotes: dateNote,
      searches: searchTraces,
      sources: allSources,
      searchDate: todayLocalDate,
      timings: { ttftMs: ttftTime || totalTime, totalMs: totalTime },
      recallSummary: pastContext ? 'Recalled matching historical turns from persistent memory' : null
    };

    await this.messageRepo.saveMessage({
      id: assistantMsgId,
      sessionId,
      userId,
      role: 'assistant',
      content: fullAssistantText,
      createdAt: getNow().toISOString(),
      localDate: todayLocalDate,
      meta
    });

    onEvent({
      type: EventType.TURN_COMPLETED,
      payload: {
        messageId: assistantMsgId,
        text: fullAssistantText,
        sources: allSources,
        meta
      }
    });

    return { id: assistantMsgId, text: fullAssistantText, sources: allSources, meta };
  }
}

