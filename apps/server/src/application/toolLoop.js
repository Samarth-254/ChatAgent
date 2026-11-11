import { EventType } from '@chatagent/shared';
import { WEB_SEARCH_TOOL } from '../domain/systemPrompt.js';

export class ToolLoop {
  /**
   * @param {Object} deps
   * @param {import('./ports/index.js').LlmPort} deps.llmPort
   * @param {import('./ports/index.js').SearchPort} deps.searchPort
   */
  constructor({ llmPort, searchPort }) {
    if (!llmPort || !searchPort) {
      throw new Error('ToolLoop requires llmPort and searchPort');
    }
    this.llmPort = llmPort;
    this.searchPort = searchPort;
  }

  async run({
    currentModel,
    messages,
    route,
    signal,
    onEvent,
    baselineDate = null,
    startTime = Date.now(),
    maxRounds = 3
  }) {
    let round = 0;
    let fullAssistantText = '';
    let ttftTime = null;
    let activeModel = currentModel;
    const allSources = [];
    const searchTraces = [];

    let firstLlmCallMs = 0;
    let searchMs = 0;
    let secondLlmCallMs = 0;

    while (round < maxRounds) {
      round++;
      const isFirstRound = round === 1;
      const forceThisRound = isFirstRound && route.forceSearch;
      const toolChoice = forceThisRound ? { type: 'function', function: { name: 'web_search' } } : 'auto';

      let currentRoundCalls = null;
      const llmStart = Date.now();

      const stream = this.llmPort.streamChat({
        model: activeModel,
        messages,
        tools: [WEB_SEARCH_TOOL],
        tool_choice: toolChoice,
        signal,
        reasoningEffort: 'low'
      });

      for await (const event of stream) {
        if (signal?.aborted) throw new Error('Request aborted by user');

        if (event.type === 'fallback') {
          activeModel = event.model;
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

      const llmDuration = Date.now() - llmStart;
      if (round === 1) {
        firstLlmCallMs = llmDuration;
      } else {
        secondLlmCallMs += llmDuration;
      }

      // If no tool calls, completion is finished
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

      // Execute tool calls concurrently in parallel
      const sStart = Date.now();
      const toolExecutions = currentRoundCalls.map(async (tc) => {
        const args = tc.arguments || {};
        const q = args.query || '';
        const searchId = `srch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const searchAfterDate = args.after_date || baselineDate || null;

        onEvent({
          type: EventType.SEARCH_STARTED,
          payload: { searchId, query: q, afterDate: searchAfterDate, domains: args.domains }
        });

        const perSearchStart = Date.now();
        let searchRes;
        try {
          searchRes = await this.searchPort.search(q, {
            topic: args.topic || 'general',
            after_date: searchAfterDate,
            before_date: args.before_date || null,
            domains: args.domains || [],
            search_depth: route.searchDepth || 'basic'
          });
        } catch (err) {
          searchRes = {
            query: q,
            results: [],
            formattedText: `[Search failed: ${err.message}]`,
            sources: []
          };
        }

        const sDuration = Date.now() - perSearchStart;
        searchTraces.push({ query: q, topic: args.topic || 'general', afterDate: searchAfterDate, ms: sDuration });

        if (searchRes.sources?.length) {
          for (const s of searchRes.sources) {
            if (!allSources.some(existing => existing.url === s.url)) {
              allSources.push(s);
            }
          }
        }

        onEvent({
          type: EventType.SEARCH_COMPLETED,
          payload: { searchId, resultCount: searchRes.results?.length || 0, ms: sDuration }
        });

        return {
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: searchRes.formattedText
        };
      });

      const toolResults = await Promise.all(toolExecutions);
      searchMs += (Date.now() - sStart);

      for (const resMsg of toolResults) {
        messages.push(resMsg);
      }

      if (allSources.length > 0) {
        onEvent({
          type: EventType.SOURCES_FOUND,
          payload: { sources: allSources }
        });
      }
    }

    return {
      fullAssistantText,
      allSources,
      searchTraces,
      activeModel,
      ttftTime: ttftTime || (Date.now() - startTime),
      timings: {
        firstLlmCallMs,
        searchMs,
        secondLlmCallMs
      }
    };
  }
}
