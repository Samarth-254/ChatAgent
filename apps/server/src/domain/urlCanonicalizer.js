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

