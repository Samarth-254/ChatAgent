import { initDb, saveMessage, closeDb } from '../src/memory.js';

export function seedEvalDb(dbPath = 'data/eval.db') {
  closeDb();
  process.env.DB_PATH = dbPath;
  const db = initDb(dbPath);

  // Clear existing eval tables
  db.exec(`
    DELETE FROM messages;
    DELETE FROM sessions;
  `);

  // 1. Seed Monday CRM shortlist: Monday, 9 November 2026
  saveMessage({
    id: 'eval_crm_u1',
    sessionId: 'session_eval_monday_crm',
    role: 'user',
    content: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team: HubSpot, Pipedrive, Zoho CRM, Salesforce, Freshsales.',
    tsUtc: '2026-11-09T10:14:00+05:30',
    tsLocalDate: '2026-11-09'
  });

  saveMessage({
    id: 'eval_crm_a1',
    sessionId: 'session_eval_monday_crm',
    role: 'assistant',
    content: `Here is the shortlist for a 20-person sales team as of Monday, 9 November 2026:
1. **HubSpot Sales Hub**: $50/user/month (Professional tier), excellent inbound tools.
2. **Pipedrive**: $24/user/month (Advanced plan), intuitive pipeline visualizer.
3. **Zoho CRM**: $20/user/month (Professional edition), high value for mid-sized teams.
4. **Salesforce Sales Cloud**: $25/user/month (Starter Suite) or $100/user/month (Pro).
5. **Freshsales**: $15/user/month (Growth) or $39/user/month (Pro).`,
    tsUtc: '2026-11-09T10:15:20+05:30',
    tsLocalDate: '2026-11-09',
    meta: {
      modelUsed: 'gemini-3.5-flash',
      searchQueriesIssued: ['HubSpot CRM pricing 2026', 'Pipedrive pricing', 'Zoho CRM pricing', 'Salesforce pricing', 'Freshsales pricing'],
      sources: [
        { url: 'https://www.hubspot.com/pricing/crm', title: 'HubSpot Pricing', domain: 'hubspot.com', published_date: '2026-11-01', type: 'official' },
        { url: 'https://www.pipedrive.com/pricing', title: 'Pipedrive Pricing', domain: 'pipedrive.com', published_date: '2026-11-01', type: 'official' },
        { url: 'https://www.zoho.com/crm/pricing.html', title: 'Zoho CRM Pricing', domain: 'zoho.com', published_date: '2026-11-01', type: 'official' }
      ],
      searchDate: '2026-11-09'
    }
  });

  // 2. Seed Tuesday Postgres hosting: Tuesday, 3 November 2026
  saveMessage({
    id: 'eval_pg_u1',
    sessionId: 'session_eval_tue_pg',
    role: 'user',
    content: 'What did I ask you on 3 November? What are the best serverless Postgres providers in 2026?',
    tsUtc: '2026-11-03T14:20:00+05:30',
    tsLocalDate: '2026-11-03'
  });

  saveMessage({
    id: 'eval_pg_a1',
    sessionId: 'session_eval_tue_pg',
    role: 'assistant',
    content: `For Postgres hosting and serverless deployments in November 2026:
- **Supabase**: Pro tier is $25/month with included compute, storage, and Auth.
- **Neon**: Serverless Postgres with branching; Launch plan is $19/month, Scale is $69/month.
- **AWS Aurora Serverless v2**: Scalable ACUs for enterprise workloads.`,
    tsUtc: '2026-11-03T14:21:40+05:30',
    tsLocalDate: '2026-11-03',
    meta: {
      modelUsed: 'gemini-3.5-flash',
      searchQueriesIssued: ['Supabase pricing 2026', 'Neon Postgres pricing plans'],
      sources: [
        { url: 'https://supabase.com/pricing', title: 'Supabase Pricing', domain: 'supabase.com', published_date: '2026-11-01', type: 'official' },
        { url: 'https://neon.tech/pricing', title: 'Neon Serverless Postgres Pricing', domain: 'neon.tech', published_date: '2026-11-01', type: 'official' }
      ],
      searchDate: '2026-11-03'
    }
  });

  // 3. Seed two days ago conversation: Sunday, 8 November 2026
  saveMessage({
    id: 'eval_sun_u1',
    sessionId: 'session_eval_sun_arch',
    role: 'user',
    content: 'What architecture patterns should we use for real-time SSE streaming?',
    tsUtc: '2026-11-08T16:00:00+05:30',
    tsLocalDate: '2026-11-08'
  });

  saveMessage({
    id: 'eval_sun_a1',
    sessionId: 'session_eval_sun_arch',
    role: 'assistant',
    content: 'For SSE streaming, use text/event-stream headers, flush chunks immediately, and handle client disconnects via AbortController.',
    tsUtc: '2026-11-08T16:01:00+05:30',
    tsLocalDate: '2026-11-08',
    meta: {
      modelUsed: 'gemini-3.5-flash-lite',
      searchQueriesIssued: [],
      sources: [],
      searchDate: '2026-11-08'
    }
  });

  return db;
}

if (process.argv[1]?.endsWith('seed.js')) {
  seedEvalDb();
  console.log('✅ Eval database successfully seeded at data/eval.db');
}
