export function extractTopicKeywords(message = '') {
  if (!message || typeof message !== 'string') return '';

  let cleaned = message
    // Strip date expressions
    .replace(/\b(last\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/gi, ' ')
    .replace(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, ' ')
    .replace(/\b(yesterday|today|tomorrow|last week|last month|this week|two days ago)\b/gi, ' ')
    .replace(/\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, ' ')
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/gi, ' ')
    // Strip conversational / intent filler
    .replace(/\b(can you (summarize|explain|show|tell me|remind me|list|give me)|could you|please)\b/gi, ' ')
    .replace(/\b(what did i ask( you)?( about)?|i asked( you)?( about)?|what did we (talk|discuss) about|we discussed|we shortlisted|discussed|talked about)\b/gi, ' ')
    .replace(/\b(what (are|were) the|what is the|what|summarize|summary of)\b/gi, ' ')
    .replace(/\b(has any( of them)?|is your answer still correct|pricing changed|pricing changes|pricing|prices|cost|plans|tiers)\b/gi, ' ')
    .replace(/\b(changed since then|changed since|changed|since then|since|any update|can you tell me|do you remember)\b/gi, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

export function scorePairRelevance(pair, topicKeywords = '') {
  if (!pair || !pair.userMsg || !pair.assistantMsg) return 0;
  if (!topicKeywords || topicKeywords.length < 2) return 1;

  const target = `${pair.userMsg.content || ''} ${pair.assistantMsg.content || ''}`.toLowerCase();
  const lowerTopic = topicKeywords.toLowerCase().trim();

  let score = 0;
  // Exact phrase match
  if (target.includes(lowerTopic)) {
    score += 10;
  }

  // Token matches
  const tokens = lowerTopic.split(/\s+/).filter(t => t.length > 2);
  for (const token of tokens) {
    if (target.includes(token)) {
      score += 2;
    }
  }

  return score;
}

export function selectBestBaseline(pairs, topicKeywords = '', primaryDate = null) {
  if (!pairs || pairs.length === 0) return null;

  let best = null;
  let highestScore = -1;

  for (const pair of pairs) {
    let score = scorePairRelevance(pair, topicKeywords);
    // Slight preference for primary candidate date if relevance is close
    if (primaryDate && pair.localDate === primaryDate && score > 0) {
      score += 0.5;
    }
    if (score > highestScore) {
      highestScore = score;
      best = pair;
    }
  }

  // Must have at least minimal relevance if topic keywords exist
  if (topicKeywords && highestScore <= 0) {
    return null;
  }

  return best;
}

export function formatBaseline(pair) {
  if (!pair) return null;
  const { userMsg, assistantMsg, localDate } = pair;
  const meta = typeof assistantMsg.meta === 'string' ? JSON.parse(assistantMsg.meta) : (assistantMsg.meta || {});
  let srcBlock = '';
  if (meta.sources && meta.sources.length > 0) {
    srcBlock = '\nEarlier sources: ' + meta.sources.map(s => `${s.title} (${s.domain || 'web'}, pub: ${s.publishedDate || s.published_date || 'unknown'})`).join('; ');
  }

  return `<baseline date="${localDate}">\n[Original Question on ${localDate}]: ${userMsg.content}\n[Original Answer on ${localDate}]: ${assistantMsg.content}${srcBlock}\n</baseline>`;
}
