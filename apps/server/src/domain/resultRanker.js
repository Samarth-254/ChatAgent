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
    }

    let postBaseline = 'unknown';
    if (afterDate && pub) {
      postBaseline = pub > afterDate;
    }

    processed.push({
      url: item.url,
      canonicalUrl: canon,
      title: (item.title || 'Untitled').trim(),
      content: (item.content || '').trim(),
      domain,
      type,
      published_date: pub,
      postBaseline,
      score
    });
  }

  return processed.sort((a, b) => {
    // Official sources strictly take precedence over aggregators/listicles
    const aIsOfficial = a.type === 'official' ? 1 : 0;
    const bIsOfficial = b.type === 'official' ? 1 : 0;
    if (aIsOfficial !== bIsOfficial) return bIsOfficial - aIsOfficial;
    return b.score - a.score;
  });
}

export function classifyBaselineChange({ baselineValue, liveValue, sources = [] }) {
  if (!sources || sources.length === 0) return 'could not verify';
  const hasPostBaseline = sources.some(s => s.postBaseline === true);
  const valuesDiffer = Boolean(liveValue && baselineValue && liveValue !== baselineValue);

  if (hasPostBaseline && valuesDiffer) {
    return 'changed';
  }
  if (valuesDiffer) {
    const hasOfficial = sources.some(s => s.type === 'official');
    if (hasOfficial) {
      return 'differs, change date unknown';
    }
  }
  return 'no change found';
}

export function formatResultsForModel(results, afterDate = null, maxResults = 4) {
  if (!results || results.length === 0) return 'No search results found.';
  return results.slice(0, maxResults).map((r, i) => {
    const pub = r.published_date || 'date unknown';
    const baselineTag = r.postBaseline === true
      ? ' | postBaseline: true (published after baseline)'
      : (r.postBaseline === false ? ` | postBaseline: false (published ${pub} <= baseline ${afterDate})` : ' | postBaseline: unknown');
    // Trim content to ~600 characters for high speed and token efficiency
    const trimmed = r.content.length > 600 ? r.content.slice(0, 580) + '...' : r.content;
    return `[${i + 1}] ${r.title} | ${r.domain} | ${r.type} | published: ${pub}${baselineTag}\n${trimmed}`;
  }).join('\n\n');
}

