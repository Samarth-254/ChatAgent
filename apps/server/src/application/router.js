import { config } from '../config/index.js';

export function routeQuery({
  userMessage,
  _resolvedDates = [],
  hasPastContext = false,
  hasBaseline = false
}) {
  const text = (userMessage || '').trim();
  const lower = text.toLowerCase();
  const fastModel = config.llm.fastModel;
  const deepModel = config.llm.deepModel;

  const isGreeting = /^(hi|hello|hey|good\s+(morning|afternoon|evening)|howdy|greetings|who are you|what can you do)[\s!.,?]*$/i.test(lower);
  if (isGreeting) {
    return { model: fastModel, reason: 'Chit-chat / greeting', forceSearch: false, searchDepth: 'basic', isDeep: false };
  }

  const isMath = /^[\d\s+\-*/().^%]+$/i.test(text) ||
    /^(what is|calculate|evaluate)\s+[\d\s+\-*/().^%]+[?]?$/i.test(lower) ||
    /\b(how much does it cost to run|what is \d+%\s+of)\b/i.test(lower);
  if (isMath) {
    return { model: fastModel, reason: 'Mathematical computation', forceSearch: false, searchDepth: 'basic', isDeep: false };
  }

  const isFormatting = /^(summarize this|rewrite|format as json|fix grammar|translate to)\b/i.test(lower);
  if (isFormatting) {
    return { model: fastModel, reason: 'Text transformation / formatting', forceSearch: false, searchDepth: 'basic', isDeep: false };
  }

  const isPureMemoryLookup = (
    (/^what did i ask( you)?\s+on\b/i.test(lower) ||
     /^what did we talk about\b/i.test(lower) ||
     /\bwe discussed\b/i.test(lower) ||
     /^(can you\s+)?summarize what (crm )?tools we discussed/i.test(lower)) &&
    !/\b(still correct|changed|pricing|since|verify|is your answer still correct)\b/i.test(lower)
  );

  if (isPureMemoryLookup) {
    return { model: fastModel, reason: 'Direct historical log recall from memory', forceSearch: false, searchDepth: 'basic', isDeep: false };
  }

  if (hasBaseline || (hasPastContext && /\b(since|changed|still correct|verify)\b/i.test(lower))) {
    return { model: deepModel, reason: 'Historical baseline re-verification against live sources', forceSearch: true, searchDepth: 'advanced', isDeep: true };
  }

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

  if (researchSignals.some(pattern => pattern.test(lower))) {
    return { model: deepModel, reason: 'Research / time-sensitive / competitive pricing signal', forceSearch: true, searchDepth: 'advanced', isDeep: true };
  }

  const stableKnowledge = [
    /\b(capital of|photosynthesis|how does\b.*work|definition of|explain\b.*algorithm|difference between tcp and udp|raft consensus)\b/i
  ];
  if (stableKnowledge.some(pattern => pattern.test(lower))) {
    return { model: fastModel, reason: 'Stable general knowledge fact', forceSearch: false, searchDepth: 'basic', isDeep: false };
  }

  return { model: fastModel, reason: 'Standard conversational query', forceSearch: false, searchDepth: 'basic', isDeep: false };
}

