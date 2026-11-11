import { processRawResults, formatResultsForModel } from '../../src/infrastructure/search/search.js';

export function getMockRawResults(query) {
  const q = (query || '').toLowerCase();
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

export async function fakeSearch(query, options = {}) {
  const qStr = typeof query === 'string' ? query : (query?.query || '');
  const { after_date = null } = typeof query === 'object' ? query : options;
  const mock = getMockRawResults(qStr);
  const proc = processRawResults(mock, qStr, after_date);
  return {
    query: qStr,
    results: proc,
    formattedText: formatResultsForModel(proc, after_date),
    sources: proc.map(p => ({ url: p.url, title: p.title, domain: p.domain, publishedDate: p.published_date, type: p.type }))
  };
}
