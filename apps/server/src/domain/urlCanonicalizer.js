import { isOfficialDomain } from './knownDomains.js';

export function canonicalizeUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    u.hash = '';
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'fbclid', 'gclid']) {
      u.searchParams.delete(p);
    }
    let host = u.hostname.toLowerCase().replace(/^www\./, '');
    let pathname = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${host}${pathname}${u.search ? '?' + u.searchParams.toString() : ''}`;
  } catch {
    return (urlStr || '').trim().toLowerCase();
  }
}

export function categorizeDomain(urlStr, query = '') {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.toLowerCase();

    // Check against canonical known official domains
    if (isOfficialDomain(urlStr, query)) {
      return { type: 'official', boost: 2.5 };
    }

    const isChangelog = path.includes('/changelog') || path.includes('/release') || path.includes('/update');
    const isPricing = path.includes('/pricing') || path.includes('/plans');
    const isDocs = host.startsWith('docs.') || path.includes('/docs');
    const isGithub = host.includes('github.com') && path.includes('/releases');
    const isGovEdu = host.endsWith('.gov') || host.endsWith('.edu');
    const qWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);

    // Listicles / SEO aggregators to downrank below official
    const aggregators = ['top10.com', 'selecthub.com', 'softwareadvice.com', 'slant.co', 'investopedia.com', 'nerdwallet.com', 'forbes.com/advisor'];
    if (aggregators.some(d => host.endsWith(d))) {
      return { type: 'aggregator', boost: 0.7 };
    }

    const reviews = ['g2.com', 'capterra.com', 'trustradius.com', 'getapp.com'];
    if (reviews.some(d => host.endsWith(d))) {
      return { type: 'review', boost: 0.8 };
    }

    if (isPricing || isChangelog || isDocs || isGithub || isGovEdu || qWords.some(w => host.includes(w))) {
      return { type: 'official', boost: 2.2 };
    }

    const news = ['reuters.com', 'bloomberg.com', 'wsj.com', 'techcrunch.com', 'theverge.com', 'arstechnica.com', 'cnbc.com', 'bbc.com', 'nytimes.com'];
    if (news.some(d => host.endsWith(d))) return { type: 'news', boost: 1.5 };

    return { type: 'other', boost: 1.0 };
  } catch {
    return { type: 'other', boost: 1.0 };
  }
}

