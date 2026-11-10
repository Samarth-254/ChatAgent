/**
 * Deterministic, zero-latency heuristic router.
 * Selects FAST_MODEL vs DEEP_MODEL and determines if web_search should be forced.
 */
export function routeQuery({
  userMessage,
  resolvedDates = [],
  hasPastContext = false,
  hasBaseline = false
}) {
  const text = (userMessage || '').trim();
  const lower = text.toLowerCase();

  const fastModel = process.env.FAST_MODEL || 'gemini-3.5-flash-lite';
  const deepModel = process.env.DEEP_MODEL || 'gemini-3.5-flash';

  // 1. Chit-chat and pure greetings -> FAST_MODEL, never force search
  const isGreeting = /^(hi|hello|hey|good\s+(morning|afternoon|evening)|howdy|greetings|who are you|what can you do)[\s!.,?]*$/i.test(lower);
  if (isGreeting) {
    return {
      model: fastModel,
      reason: 'Chit-chat / greeting',
      forceSearch: false,
      searchDepth: 'basic',
      isDeep: false
    };
  }

  // 2. Simple math and pure calculation
  const isMath = /^[\d\s+\-*/().^%]+$/i.test(text) ||
    /^(what is|calculate|evaluate)\s+[\d\s+\-*/().^%]+[?]?$/i.test(lower) ||
    /\b(how much does it cost to run|what is \d+%\s+of)\b/i.test(lower);
  if (isMath) {
    return {
      model: fastModel,
      reason: 'Mathematical computation',
      forceSearch: false,
      searchDepth: 'basic',
      isDeep: false
    };
  }

  // 3. Simple text formatting or summarization instructions
  const isFormatting = /^(summarize this|rewrite|format as json|fix grammar|translate to)\b/i.test(lower);
  if (isFormatting) {
    return {
      model: fastModel,
      reason: 'Text transformation / formatting',
      forceSearch: false,
      searchDepth: 'basic',
      isDeep: false
    };
  }

  // 4. Memory-only lookup without re-verification
  // e.g., "what did I ask on 3 November?", "what did we talk about two days ago?", "summarize what CRM tools we discussed"
  const isPureMemoryLookup = (
    (/^what did i ask( you)?\s+on\b/i.test(lower) ||
     /^what did we talk about\b/i.test(lower) ||
     /\bwe discussed\b/i.test(lower) ||
     /^(can you\s+)?summarize what (crm )?tools we discussed/i.test(lower)) &&
    !/\b(still correct|changed|pricing|since|verify|is your answer still correct)\b/i.test(lower)
  );

  if (isPureMemoryLookup) {
    return {
      model: fastModel,
      reason: 'Direct historical log recall from memory',
      forceSearch: false,
      searchDepth: 'basic',
      isDeep: false
    };
  }

  // 5. Baseline re-verification -> DEEP_MODEL + force search
  if (hasBaseline || (hasPastContext && /\b(since|changed|still correct|verify)\b/i.test(lower))) {
    return {
      model: deepModel,
      reason: 'Historical baseline re-verification against live sources',
      forceSearch: true,
      searchDepth: 'advanced',
      isDeep: true
    };
  }

  // 6. Research & Time-sensitive Signals -> DEEP_MODEL + force search
  const researchSignals = [
    /\b(pricing|price|cost|tier|plans|\$|discount|subscription)\b/i,
    /\b(changed|since|update|latest|new feature|released|shipped)\b/i,
    /\b(still correct|is your answer still correct|verify|re-verify)\b/i,
    /\b(vs|compare|comparison|alternative|shortlist|shortlisted)\b/i,
    /\b(current\s+ceo|who\s+is\s+the\s+ceo|current\s+leader|founder)\b/i,
    /\b(news|yesterday's|today's|last\s+24h|recent\s+announcement)\b/i,
    /\b(batch\s+api|api\s+pricing|token\s+cost|per\s+million)\b/i,
    /\b(battery life|specs|latest stable version|version of)\b/i,
    /\b(secretly acquire|acquisition|merger)\b/i
  ];

  const hasResearchSignal = researchSignals.some(pattern => pattern.test(lower));
  if (hasResearchSignal) {
    return {
      model: deepModel,
      reason: 'Research / time-sensitive / competitive pricing signal',
      forceSearch: true,
      searchDepth: 'advanced',
      isDeep: true
    };
  }

  // 7. Timeless / Stable facts with no temporal dependency
  const stableKnowledge = [
    /\b(capital of|photosynthesis|how does\b.*work|definition of|explain\b.*algorithm|difference between tcp and udp|raft consensus)\b/i
  ];
  if (stableKnowledge.some(pattern => pattern.test(lower))) {
    return {
      model: fastModel,
      reason: 'Stable general knowledge fact',
      forceSearch: false,
      searchDepth: 'basic',
      isDeep: false
    };
  }

  // Default: Fast model with discretionary tool use
  return {
    model: fastModel,
    reason: 'Standard conversational query',
    forceSearch: false,
    searchDepth: 'basic',
    isDeep: false
  };
}
