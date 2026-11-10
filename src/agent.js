import { resolveRelativeDates, getNow, formatLocalDate, formatClockBlock } from './clock.js';
import { getSessionHistory, saveMessage, recall, findBaseline, getStoredQuestionsForDate, getNearestDaysWithRecords } from './memory.js';
import { routeQuery } from './router.js';
import { buildSystemPrompt, WEB_SEARCH_TOOL } from './prompts.js';
import { streamChat } from './llm.js';
import { search } from './search.js';

/**
 * Main Agent Execution Loop
 *
 * @param {Object} params
 * @param {string} params.sessionId - Target session ID
 * @param {string} params.userMessage - User input text
 * @param {Function} params.onEvent - Callback for streaming events: { type, ... }
 * @param {AbortSignal} [params.signal] - Cancellation signal
 */
export async function runAgent({ sessionId, userMessage, onEvent = () => {}, signal = null }) {
  const startTime = Date.now();
  const now = getNow();
  const todayLocalDate = formatLocalDate(now);

  // 1. Resolve relative dates deterministically
  const { textWithNote, dateNote, resolvedDates } = resolveRelativeDates(userMessage, now);

  // 2. Fetch recent within-session conversation history
  const recentTurns = getSessionHistory(sessionId, 12);

  // 3. Recall cross-session memory and baseline if applicable
  const { pastContext } = recall({ query: userMessage, resolvedDates, currentSessionId: sessionId });
  const baseline = findBaseline({ query: userMessage, resolvedDates, currentSessionId: sessionId });

  // Handle direct "what did I ask on <date>" check
  let directQuestionList = null;
  const isDirectAsk = /^what did i ask( you)?\s+on\b/i.test(userMessage.trim());
  if (isDirectAsk && resolvedDates.length > 0 && resolvedDates[0].iso) {
    const targetDate = resolvedDates[0].iso;
    const questions = getStoredQuestionsForDate(targetDate);
    if (questions.length === 0) {
      const nearest = getNearestDaysWithRecords();
      directQuestionList = {
        hasRecords: false,
        targetDate,
        nearest
      };
    } else {
      directQuestionList = {
        hasRecords: true,
        targetDate,
        questions
      };
    }
  }

  // 4. Deterministic Router Selection
  const route = routeQuery({
    userMessage,
    resolvedDates,
    hasPastContext: !!pastContext,
    hasBaseline: !!baseline
  });

  // Save the user's incoming message
  const userMsgId = `msg_${Date.now()}_u`;
  saveMessage({
    id: userMsgId,
    sessionId,
    role: 'user',
    content: userMessage,
    tsUtc: now.toISOString(),
    tsLocalDate: todayLocalDate
  });

  // 5. Build System Prompt
  const clockBlock = formatClockBlock(now);
  let extraPromptNote = '';
  if (directQuestionList) {
    if (directQuestionList.hasRecords) {
      const qList = directQuestionList.questions.map(q => `[${q.time}] "${q.content}"`).join('\n');
      extraPromptNote = `\n<exact_stored_questions_for_${directQuestionList.targetDate}>\n${qList}\n</exact_stored_questions_for_${directQuestionList.targetDate}>`;
    } else {
      const nearStr = directQuestionList.nearest.length ? directQuestionList.nearest.join(', ') : 'none';
      extraPromptNote = `\n<memory_lookup_result>\nNO RECORDS FOUND for ${directQuestionList.targetDate}. Nearest dates with records: ${nearStr}.\nState this clearly to the user.\n</memory_lookup_result>`;
    }
  }

  const systemContent = buildSystemPrompt({
    clockBlock,
    pastContext: (pastContext || '') + extraPromptNote,
    baseline,
    dateNote
  });

  // 6. Assemble messages for LLM
  const messages = [
    { role: 'system', content: systemContent }
  ];

  for (const turn of recentTurns) {
    messages.push({
      role: turn.role,
      content: turn.content
    });
  }

  // Add the current user message with date annotation
  messages.push({
    role: 'user',
    content: textWithNote
  });

  // 7. Multi-turn Agent Tool Execution Loop
  let currentModel = route.model;
  const maxRounds = 4;
  let round = 0;
  let fullAssistantText = '';
  const allSources = [];
  const allQueriesIssued = [];
  let modelUsedFinal = currentModel;

  while (round < maxRounds) {
    round++;
    const isFirstRound = round === 1;
    const forceThisRound = isFirstRound && route.forceSearch;

    // First round may require tool_choice if research signal is present
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
        modelUsedFinal = event.model;
        onEvent({ type: 'status', message: event.reason });
      } else if (event.type === 'text_delta') {
        fullAssistantText += event.text;
        onEvent({ type: 'token', text: event.text });
      } else if (event.type === 'tool_calls') {
        currentRoundCalls = event.toolCalls;
      }
    }

    // If no tool calls were requested, loop is complete
    if (!currentRoundCalls || currentRoundCalls.length === 0) {
      break;
    }

    // Append assistant's tool-call message to conversation history
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: currentRoundCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: tc.rawArguments || JSON.stringify(tc.arguments)
        }
      }))
    });

    // Execute ALL tool calls in parallel using Promise.all
    const toolExecutions = currentRoundCalls.map(async (tc) => {
      const args = tc.arguments || {};
      const query = args.query || '';
      allQueriesIssued.push(query);

      // Emit status event immediately for fast perceived latency
      onEvent({ type: 'status', message: `Searching: ${query}` });

      const searchRes = await search(query, {
        topic: args.topic || 'general',
        after_date: args.after_date || null,
        before_date: args.before_date || null,
        domains: args.domains || [],
        search_depth: route.searchDepth
      });

      // Collect unique sources
      if (searchRes.sources?.length) {
        for (const s of searchRes.sources) {
          if (!allSources.some(existing => existing.url === s.url)) {
            allSources.push(s);
          }
        }
        onEvent({ type: 'sources', sources: allSources });
      }

      return {
        role: 'tool',
        tool_call_id: tc.id,
        content: searchRes.formattedText
      };
    });

    const toolResponses = await Promise.all(toolExecutions);

    // Append tool responses to message chain
    for (const tr of toolResponses) {
      messages.push(tr);
    }

    // If round reaches cap, execute one final synthesis pass with tools disabled
    if (round === maxRounds) {
      messages.push({
        role: 'system',
        content: 'Search budget limit reached. Provide your final answer immediately based on the retrieved information above. Clearly state if any items could not be verified.'
      });

      const finalStream = streamChat({
        model: currentModel,
        messages,
        tools: undefined,
        signal
      });

      for await (const event of finalStream) {
        if (event.type === 'text_delta') {
          fullAssistantText += event.text;
          onEvent({ type: 'token', text: event.text });
        }
      }
    }
  }

  // 8. Persist Assistant response & metadata to database
  const assistantMsgId = `msg_${Date.now()}_a`;
  const meta = {
    modelUsed: modelUsedFinal,
    searchQueriesIssued: allQueriesIssued,
    sources: allSources,
    searchDate: todayLocalDate,
    routingReason: route.reason,
    latencyMs: Date.now() - startTime
  };

  saveMessage({
    id: assistantMsgId,
    sessionId,
    role: 'assistant',
    content: fullAssistantText,
    tsUtc: getNow().toISOString(),
    tsLocalDate: todayLocalDate,
    meta
  });

  onEvent({
    type: 'done',
    text: fullAssistantText,
    sources: allSources,
    meta
  });

  return {
    text: fullAssistantText,
    sources: allSources,
    meta
  };
}
