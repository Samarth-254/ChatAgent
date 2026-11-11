/**
 * Canonical mapping from common entity / vendor names to official domains.
 * Used to prioritize official source verification and restrict search domains.
 */

export const KNOWN_DOMAINS = {
  // CRM tools
  'hubspot': ['hubspot.com'],
  'salesforce': ['salesforce.com'],
  'zoho': ['zoho.com'],
  'zoho crm': ['zoho.com'],
  'pipedrive': ['pipedrive.com'],
  'freshsales': ['freshworks.com', 'freshsales.io'],
  'freshworks': ['freshworks.com'],
  'monday': ['monday.com'],
  'monday.com': ['monday.com'],
  'close': ['close.com'],
  'close crm': ['close.com'],
  'attio': ['attio.com'],
  'copper': ['copper.com'],
  'capsule': ['capsulecrm.com'],

  // Postgres & Database Hosting
  'supabase': ['supabase.com'],
  'neon': ['neon.tech'],
  'render': ['render.com'],
  'railway': ['railway.app', 'railway.com'],
  'fly': ['fly.io'],
  'fly.io': ['fly.io'],
  'heroku': ['heroku.com'],
  'tembo': ['tembo.io'],
  'crunchy data': ['crunchydata.com'],
  'crunchy': ['crunchydata.com'],
  'timescale': ['timescale.com'],
  'aws': ['aws.amazon.com'],
  'gcp': ['cloud.google.com'],
  'google cloud': ['cloud.google.com'],
  'azure': ['azure.microsoft.com'],

  // Developer & Cloud Tools
  'openai': ['openai.com'],
  'anthropic': ['anthropic.com'],
  'groq': ['groq.com'],
  'pinecone': ['pinecone.io'],
  'vercel': ['vercel.com'],
  'github': ['github.com'],
  'gitlab': ['gitlab.com'],
  'linear': ['linear.app'],
  'figma': ['figma.com'],
  'stripe': ['stripe.com'],
  'datadog': ['datadoghq.com'],
  'redis': ['redis.io', 'redis.com'],
  'cloudflare': ['cloudflare.com']
};

/**
 * Extract official domains for any recognized entities found in a query string.
 * @param {string} query
 * @returns {string[]}
 */
export function extractKnownDomains(query) {
  if (!query || typeof query !== 'string') return [];
  const lower = query.toLowerCase();
  const matched = new Set();

  for (const [entity, domains] of Object.entries(KNOWN_DOMAINS)) {
    // Word boundary check
    const regex = new RegExp(`(^|\\b)${entity.replace('.', '\\.')}(\\b|$)`, 'i');
    if (regex.test(lower)) {
      for (const d of domains) matched.add(d);
    }
  }

  return Array.from(matched);
}

/**
 * Check if a given URL or hostname belongs to an official domain for an entity or query.
 * @param {string} url
 * @param {string} [entityOrQuery]
 * @returns {boolean}
 */
export function isOfficialDomain(url, entityOrQuery) {
  if (!url) return false;
  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    hostname = String(url).toLowerCase();
  }

  const domains = entityOrQuery ? extractKnownDomains(entityOrQuery) : Object.values(KNOWN_DOMAINS).flat();
  return domains.some(d => hostname === d || hostname.endsWith(`.${d}`));
}

