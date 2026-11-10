import crypto from 'crypto';
import { runMigrations } from '../src/infrastructure/storage/postgres/migrationRunner.js';
import { PostgresSessionRepository } from '../src/infrastructure/storage/postgres/postgresSessionRepository.js';
import { PostgresMessageRepository } from '../src/infrastructure/storage/postgres/postgresMessageRepository.js';

export const EVAL_USER_ID = '00000000-0000-0000-0000-000000000001';

export async function seedEvalDb(db) {
  await runMigrations(db);
  const sessionRepo = new PostgresSessionRepository(db);
  const messageRepo = new PostgresMessageRepository(db);

  await sessionRepo.ensureUser(EVAL_USER_ID);

  // 1. Monday CRM shortlist: Monday, 9 November 2026
  const crmSessionId = '00000000-0000-0000-0000-000000000010';
  await sessionRepo.createSession(crmSessionId, EVAL_USER_ID, 'CRM Shortlist');

  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId: crmSessionId,
    userId: EVAL_USER_ID,
    role: 'user',
    content: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team: HubSpot, Pipedrive, Zoho CRM, Salesforce, Freshsales.',
    createdAt: '2026-11-09T10:14:00+05:30',
    localDate: '2026-11-09'
  });

  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId: crmSessionId,
    userId: EVAL_USER_ID,
    role: 'assistant',
    content: `Here is the shortlist for a 20-person sales team as of Monday, 9 November 2026:
1. **HubSpot Sales Hub**: $50/user/month (Professional tier), excellent inbound tools.
2. **Pipedrive**: $24/user/month (Advanced plan), intuitive pipeline visualizer.
3. **Zoho CRM**: $20/user/month (Professional edition), high value for mid-sized teams.
4. **Salesforce Sales Cloud**: $25/user/month (Starter Suite) or $100/user/month (Pro).
5. **Freshsales**: $15/user/month (Growth) or $39/user/month (Pro).`,
    createdAt: '2026-11-09T10:15:20+05:30',
    localDate: '2026-11-09',
    meta: {
      model: 'gemini-2.5-flash',
      searches: [
        { query: 'HubSpot CRM pricing 2026', topic: 'general', afterDate: '2026-11-09', ms: 120 }
      ],
      sources: [
        { url: 'https://www.hubspot.com/pricing/crm', title: 'HubSpot Pricing', domain: 'hubspot.com', publishedDate: '2026-11-01', type: 'official' },
        { url: 'https://www.pipedrive.com/pricing', title: 'Pipedrive Pricing', domain: 'pipedrive.com', publishedDate: '2026-11-01', type: 'official' },
        { url: 'https://www.zoho.com/crm/pricing.html', title: 'Zoho CRM Pricing', domain: 'zoho.com', publishedDate: '2026-11-01', type: 'official' }
      ],
      searchDate: '2026-11-09'
    }
  });

  // 2. Tuesday Postgres hosting: Tuesday, 3 November 2026
  const pgSessionId = '00000000-0000-0000-0000-000000000020';
  await sessionRepo.createSession(pgSessionId, EVAL_USER_ID, 'Postgres Hosting');

  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId: pgSessionId,
    userId: EVAL_USER_ID,
    role: 'user',
    content: 'What did I ask you on 3 November? What are the best serverless Postgres providers in 2026?',
    createdAt: '2026-11-03T14:20:00+05:30',
    localDate: '2026-11-03'
  });

  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId: pgSessionId,
    userId: EVAL_USER_ID,
    role: 'assistant',
    content: `For Postgres hosting and serverless deployments in November 2026:
- **Supabase**: Pro tier is $25/month with included compute, storage, and Auth.
- **Neon**: Serverless Postgres with branching; Launch plan is $19/month, Scale is $69/month.
- **AWS Aurora Serverless v2**: Scalable ACUs for enterprise workloads.`,
    createdAt: '2026-11-03T14:21:40+05:30',
    localDate: '2026-11-03',
    meta: {
      model: 'gemini-2.5-flash',
      searches: [],
      sources: [
        { url: 'https://supabase.com/pricing', title: 'Supabase Pricing', domain: 'supabase.com', publishedDate: '2026-11-01', type: 'official' },
        { url: 'https://neon.tech/pricing', title: 'Neon Serverless Postgres Pricing', domain: 'neon.tech', publishedDate: '2026-11-01', type: 'official' }
      ],
      searchDate: '2026-11-03'
    }
  });

  // 3. Sunday, 8 November 2026 architecture question
  const sunSessionId = '00000000-0000-0000-0000-000000000030';
  await sessionRepo.createSession(sunSessionId, EVAL_USER_ID, 'Architecture Chat');

  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId: sunSessionId,
    userId: EVAL_USER_ID,
    role: 'user',
    content: 'What architecture patterns should we use for real-time SSE streaming?',
    createdAt: '2026-11-08T16:00:00+05:30',
    localDate: '2026-11-08'
  });

  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId: sunSessionId,
    userId: EVAL_USER_ID,
    role: 'assistant',
    content: 'For SSE streaming, use text/event-stream headers, flush chunks immediately, and handle client disconnects via AbortController.',
    createdAt: '2026-11-08T16:01:00+05:30',
    localDate: '2026-11-08',
    meta: {
      model: 'gemini-2.5-flash',
      searches: [],
      sources: [],
      searchDate: '2026-11-08'
    }
  });

  return { sessionRepo, messageRepo };
}

