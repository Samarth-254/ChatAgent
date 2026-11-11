import { config } from '../../config/index.js';
import { processRawResults, formatResultsForModel } from '../../domain/resultRanker.js';

export { processRawResults, formatResultsForModel };
export { canonicalizeUrl, categorizeDomain } from '../../domain/urlCanonicalizer.js';

class SearchCache {
  constructor(maxSize = 200, ttlMs = 10 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  getKey(q, opts) {
    return JSON.stringify({
      q: (q || '').trim().toLowerCase(),
      t: opts.topic || 'general',
      a: opts.after_date || '',
      b: opts.before_date || '',
      d: (opts.domains || []).slice().sort()
    });
  }

  get(k) {
    const e = this.cache.get(k);
    if (!e || Date.now() - e.timestamp > this.ttlMs) return null;
    this.cache.delete(k);
    this.cache.set(k, e);
    return e.value;
  }

  set(k, v) {
    if (this.cache.size >= this.maxSize) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(k, { value: v, timestamp: Date.now() });
  }
}

const searchCache = new SearchCache();

async function fetchTavilyWithRetry(payload, apiKey) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey
        },
        body: JSON.stringify({ api_key: apiKey, ...payload }),
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Tavily HTTP ${res.status}: ${errText}`);
      }
      const data = await res.json();
      return data.results || [];
    } catch (err) {
      clearTimeout(t);
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 400));
    }
  }
  return [];
}

export async function search(query, options = {}) {
  const qStr = typeof query === 'string' ? query : (query?.query || '');
  const opts = typeof query === 'object' && query !== null ? { ...query, ...options } : options;
  const { topic = 'general', after_date = null, before_date = null, domains = [], search_depth = 'basic' } = opts;

  const key = searchCache.getKey(qStr, { topic, after_date, before_date, domains });
  const hit = searchCache.get(key);
  if (hit) return hit;

  const apiKey = config.search.apiKey;
  if (!apiKey) {
    throw new Error('Tavily search API key is missing. Set TAVILY_API_KEY in environment.');
  }

  // Fast defaults: search_depth basic, max 5 results
  const payload = {
    query: qStr,
    topic,
    search_depth,
    max_results: 5,
    include_raw_content: false
  };
  if (domains.length) payload.include_domains = domains;
  if (after_date) payload.start_date = after_date;
  if (before_date) payload.end_date = before_date;

  try {
    let raw = await fetchTavilyWithRetry(payload, apiKey);

    // Fallback to unrestricted query only if restricted returns nothing useful
    if ((!raw || raw.length === 0) && domains.length > 0) {
      const unrestrictedPayload = { ...payload };
      delete unrestrictedPayload.include_domains;
      const unrestrictedRaw = await fetchTavilyWithRetry(unrestrictedPayload, apiKey);
      if (unrestrictedRaw && unrestrictedRaw.length > 0) {
        raw = unrestrictedRaw;
      }
    }

    // If first round returned too little (< 2 results) and search was basic, retry with advanced
    if ((!raw || raw.length < 2) && search_depth === 'basic') {
      payload.search_depth = 'advanced';
      const advancedRaw = await fetchTavilyWithRetry(payload, apiKey);
      if (advancedRaw && advancedRaw.length > 0) {
        raw = advancedRaw;
      }
    }

    const proc = processRawResults(raw, qStr, after_date);
    const res = {
      query: qStr,
      results: proc,
      formattedText: formatResultsForModel(proc, after_date, 4),
      sources: proc.map(p => ({
        url: p.url,
        title: p.title,
        domain: p.domain,
        publishedDate: p.published_date,
        type: p.type
      }))
    };
    searchCache.set(key, res);
    return res;
  } catch (err) {
    return {
      query: qStr,
      results: [],
      formattedText: `[Search error for "${qStr}": ${err.message}. Could not retrieve web results.]`,
      sources: [],
      error: err.message
    };
  }
}
