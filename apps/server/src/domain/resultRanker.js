import { canonicalizeUrl, categorizeDomain } from './urlCanonicalizer.js';

export function processRawResults(results, query, afterDate = null) {
  if (!Array.isArray(results)) return [];
  const seenUrls = new Set();
  const processed = [];

  for (const item of results) {
    if (!item.url) continue;
    const canon = canonicalizeUrl(item.url);
    if (seenUrls.has(canon)) continue;
    seenUrls.add(canon);

    let domain = 'web';
    try {
      domain = new URL(item.url).hostname.replace(/^www\./, '');
    } catch {}

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
      if (afterDate && pub && pub < afterDate) {
        isBeforeCutoff = true;
      }
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

export function formatResultsForModel(results, afterDate = null, maxResults = 5) {
  if (!results || results.length === 0) return 'No search results found.';
  return results.slice(0, maxResults).map((r, i) => {
    const pub = r.published_date || 'date unknown';
    const tag = r.isBeforeCutoff ? ` [BEFORE cutoff ${afterDate}]` : '';
    // Trim content to ~1000 characters for high speed and token efficiency
    const trimmed = r.content.length > 1000 ? r.content.slice(0, 980) + '...' : r.content;
    return `[${i + 1}] ${r.title} | ${r.domain} | ${r.type} | published: ${pub}${tag}\n${trimmed}`;
  }).join('\n\n');
}

