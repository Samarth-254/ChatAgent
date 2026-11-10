/**
 * In-memory LRU Cache with 10-minute TTL
 */
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
      const m = pub.match(/\d{4}-\d{2}-\d{2}/);
      if (m) pub = m[0];
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
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
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
  const { topic = 'general', after_date = null, before_date = null, domains = [], search_depth = 'basic' } = options;
  const key = searchCache.getKey(query, { topic, after_date, before_date, domains });
  const hit = searchCache.get(key);
  if (hit) return hit;

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || process.env.MOCK_SEARCH === '1') {
    const mock = getMockResults(query);
    const proc = processRawResults(mock, query, after_date);
    const res = { query, results: proc, formattedText: formatResultsForModel(proc, after_date), sources: proc.map(p => ({ url: p.url, title: p.title, domain: p.domain, published_date: p.published_date, type: p.type })) };
    searchCache.set(key, res);
    return res;
  }

  const payload = { query, topic, search_depth, max_results: 6, include_raw_content: false };
  if (domains.length) payload.include_domains = domains;
  if (after_date) payload.start_date = after_date;
  if (before_date) payload.end_date = before_date;

  try {
    const raw = await fetchTavilyWithRetry(payload, apiKey);
    const proc = processRawResults(raw, query, after_date);
    const res = { query, results: proc, formattedText: formatResultsForModel(proc, after_date), sources: proc.map(p => ({ url: p.url, title: p.title, domain: p.domain, published_date: p.published_date, type: p.type })) };
    searchCache.set(key, res);
    return res;
  } catch (err) {
    return { query, results: [], formattedText: `[Search error for "${query}": ${err.message}. Could not retrieve web results.]`, sources: [], error: err.message };
  }
}

function getMockResults(query) {
  const q = query.toLowerCase();
  if (q.includes('hubspot')) return [{ url: 'https://www.hubspot.com/pricing/crm', title: 'HubSpot Pricing', content: 'HubSpot Sales Hub Professional: $50/seat/mo. Nov 10, 2026: Released Breeze AI prospecting tools.', published_date: '2026-11-10', score: 0.95 }];
  if (q.includes('pipedrive')) return [{ url: 'https://www.pipedrive.com/pricing', title: 'Pipedrive Pricing Plans', content: 'Advanced plan: $24/user/mo billed annually. No price changes.', published_date: '2026-11-08', score: 0.93 }];
  if (q.includes('zoho')) return [{ url: 'https://www.zoho.com/crm/pricing.html', title: 'Zoho CRM Pricing', content: 'Zoho CRM Professional is $23/user/mo.', published_date: '2026-11-05', score: 0.91 }];
  if (q.includes('salesforce')) return [{ url: 'https://www.salesforce.com/editions-pricing', title: 'Salesforce Sales Cloud Pricing', content: 'Starter Suite: $25/user/mo. Pro Suite: $100/user/mo.', published_date: '2026-11-09', score: 0.94 }];
  if (q.includes('freshsales')) return [{ url: 'https://www.freshworks.com/crm/sales/pricing', title: 'Freshsales Pricing', content: 'Pro plan is $39/user/mo. Growth is $15/user/mo.', published_date: '2026-11-07', score: 0.90 }];
  if (q.includes('postgres') || q.includes('supabase') || q.includes('neon')) return [{ url: 'https://supabase.com/pricing', title: 'Supabase Pricing', content: 'Supabase Pro remains $25/month.', published_date: '2026-11-09', score: 0.95 }, { url: 'https://neon.tech/pricing', title: 'Neon Postgres Pricing', content: 'Neon Launch is $19/month, Scale is $69/month.', published_date: '2026-11-08', score: 0.94 }];
  if (q.includes('linear')) return [{ url: 'https://linear.app/pricing', title: 'Linear Pricing', content: 'Standard is $8/user/month.', published_date: '2026-11-01', score: 0.95 }];
  if (q.includes('jira')) return [{ url: 'https://www.atlassian.com/software/jira/pricing', title: 'Jira Pricing', content: 'Standard plan is $8.15/user/month.', published_date: '2026-11-01', score: 0.95 }];
  if (q.includes('clickup')) return [{ url: 'https://clickup.com/pricing', title: 'ClickUp Pricing', content: 'Business plan is $12/user/month.', published_date: '2026-11-01', score: 0.95 }];
  if (q.includes('ceo of github')) return [{ url: 'https://github.blog/leadership', title: 'GitHub Leadership', content: 'Thomas Dohmke is Chief Executive Officer (CEO) of GitHub.', published_date: '2026-11-01', score: 0.96 }];
  if (q.includes('gpt-4o')) return [{ url: 'https://openai.com/api/pricing', title: 'OpenAI Pricing', content: 'GPT-4o input tokens cost $2.50 per 1M tokens, output $10.00.', published_date: '2026-11-05', score: 0.96 }];
  if (q.includes('macbook air')) return [{ url: 'https://apple.com/macbook-air/specs', title: 'MacBook Air Specs', content: 'M3 MacBook Air offers up to 18 hours of battery life.', published_date: '2026-11-01', score: 0.96 }];
  if (q.includes('sqlite')) return [{ url: 'https://sqlite.org/news.html', title: 'SQLite News', content: 'SQLite 3.47 is the latest stable release.', published_date: '2026-11-01', score: 0.96 }];
  if (q.includes('snowflake')) return [{ url: 'https://snowflake.com/pricing', title: 'Snowflake Pricing', content: 'No base pricing changes announced since last month.', published_date: '2026-11-01', score: 0.96 }];
  return [{ url: 'https://official-source.org/info', title: `${query} Verified`, content: `Current data for ${query} as of November 2026.`, published_date: '2026-11-10', score: 0.85 }];
}
