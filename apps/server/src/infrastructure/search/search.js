import { config } from '../../config/index.js';

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

export function canonicalizeUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    u.hash = '';
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'fbclid', 'gclid']) u.searchParams.delete(p);
    let host = u.hostname.toLowerCase().replace(/^www\./, '');
    let pathname = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${host}${pathname}${u.search ? '?' + u.searchParams.toString() : ''}`;
  } catch {
    return urlStr.trim().toLowerCase();
  }
}

export function categorizeDomain(urlStr, query = '') {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    const isChangelog = path.includes('/changelog') || path.includes('/release') || path.includes('/update');
    const isPricing = path.includes('/pricing') || path.includes('/plans');
    const isDocs = host.startsWith('docs.') || path.includes('/docs');
    const isGithub = host.includes('github.com') && path.includes('/releases');
    const isGovEdu = host.endsWith('.gov') || host.endsWith('.edu');
    const qWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);

    if (isPricing || isChangelog || isDocs || isGithub || isGovEdu || qWords.some(w => host.includes(w))) {
      return { type: 'official', boost: 2.0 };
    }
    const news = ['reuters.com', 'bloomberg.com', 'wsj.com', 'techcrunch.com', 'theverge.com', 'arstechnica.com', 'cnbc.com', 'bbc.com', 'nytimes.com'];
    if (news.some(d => host.endsWith(d))) return { type: 'news', boost: 1.5 };
    const reviews = ['g2.com', 'capterra.com', 'trustradius.com'];
    if (reviews.some(d => host.endsWith(d))) return { type: 'review', boost: 1.0 };
    return { type: 'other', boost: 1.0 };
  } catch {
    return { type: 'other', boost: 1.0 };
  }
}

export function processRawResults(results, query, afterDate = null) {
  const seenUrls = new Set();
  const processed = [];

  for (const item of results) {
    if (!item.url) continue;
    const canon = canonicalizeUrl(item.url);
    if (seenUrls.has(canon)) continue;
    seenUrls.add(canon);

    let domain = 'web';
    try { domain = new URL(item.url).hostname.replace(/^www\./, ''); } catch {}
    const { type, boost } = categorizeDomain(item.url, query);
    const score = (typeof item.score === 'number' ? item.score : 0.8) * boost;

    let isBeforeCutoff = false;
    let pub = item.published_date || null;
    if (pub) {
      try {
        const parsed = new Date(pub);
        if (!isNaN(parsed.getTime())) {
          pub = parsed.toISOString().slice(0, 10);
        } else {
          const m = pub.match(/\d{4}-\d{2}-\d{2}/);
          if (m) pub = m[0];
        }
      } catch {
        const m = pub.match(/\d{4}-\d{2}-\d{2}/);
        if (m) pub = m[0];
      }
      if (afterDate && pub && pub < afterDate) isBeforeCutoff = true;
    }

    processed.push({
      url: item.url,
      canonicalUrl: canon,
      title: (item.title || 'Untitled').trim(),
      content: (item.content || '').trim(),
      domain,
      type,
      published_date: pub,
      isBeforeCutoff,
      score
    });
  }
  return processed.sort((a, b) => b.score - a.score);
}

export function formatResultsForModel(results, afterDate = null) {
  if (!results || results.length === 0) return 'No search results found.';
  return results.slice(0, 6).map((r, i) => {
    const pub = r.published_date || 'date unknown';
    const tag = r.isBeforeCutoff ? ` [BEFORE cutoff ${afterDate}]` : '';
    const trimmed = r.content.length > 1200 ? r.content.slice(0, 1180) + '...' : r.content;
    return `[${i + 1}] ${r.title} | ${r.domain} | ${r.type} | published: ${pub}${tag}\n${trimmed}`;
  }).join('\n\n');
}

async function fetchTavilyWithRetry(payload, apiKey) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
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
      await new Promise(r => setTimeout(r, 600));
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

  const payload = {
    query: qStr,
    topic,
    search_depth,
    max_results: 6,
    include_raw_content: false
  };
  if (domains.length) payload.include_domains = domains;
  if (after_date) payload.start_date = after_date;
  if (before_date) payload.end_date = before_date;

  try {
    const raw = await fetchTavilyWithRetry(payload, apiKey);
    const proc = processRawResults(raw, qStr, after_date);
    const res = {
      query: qStr,
      results: proc,
      formattedText: formatResultsForModel(proc, after_date),
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
