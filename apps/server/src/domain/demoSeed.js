import crypto from 'crypto';

export async function seedDemoHistory(sessionRepo, messageRepo, demoUserId = '00000000-0000-0000-0000-000000000001') {
  await sessionRepo.ensureUser(demoUserId);

  const crmSess = crypto.randomUUID();
  await sessionRepo.createSession(crmSess, demoUserId, 'CRM Shortlist Evaluation');
  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId: crmSess,
    userId: demoUserId,
    role: 'user',
    content: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team: HubSpot, Pipedrive, Zoho CRM, Salesforce, Freshsales.',
    createdAt: '2026-11-09T10:00:00+05:30',
    localDate: '2026-11-09'
  });
  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId: crmSess,
    userId: demoUserId,
    role: 'assistant',
    content: `Here is the shortlist for a 20-person sales team as of Monday, 9 November 2026:
1. **HubSpot Sales Hub**: Professional tier, inbound automation and CRM analytics.
2. **Pipedrive**: Advanced plan, visual sales pipeline and activity tracking.
3. **Zoho CRM**: Professional edition, multichannel management and custom workflows.
4. **Salesforce Sales Cloud**: Starter Suite / Enterprise, lead scoring and pipeline management.
5. **Freshsales**: Growth / Pro tier, built-in phone and contact management.`,
    createdAt: '2026-11-09T10:01:00+05:30',
    localDate: '2026-11-09'
  });

  const pgSess = crypto.randomUUID();
  await sessionRepo.createSession(pgSess, demoUserId, 'Postgres Serverless Evaluation');
  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId: pgSess,
    userId: demoUserId,
    role: 'user',
    content: 'What did I ask you on 3 November? What are the best serverless Postgres providers in 2026?',
    createdAt: '2026-11-03T14:00:00+05:30',
    localDate: '2026-11-03'
  });
  await messageRepo.saveMessage({
    id: crypto.randomUUID(),
    sessionId: pgSess,
    userId: demoUserId,
    role: 'assistant',
    content: `For Postgres hosting and serverless deployments in November 2026:
- **Supabase**: Pro tier with managed PostgreSQL, built-in Auth, database storage, and edge functions.
- **Neon**: Serverless Postgres featuring database branching, compute autoscaling, and storage-compute separation.
- **AWS Aurora Serverless v2**: Scalable ACUs for dynamic enterprise PostgreSQL workloads.`,
    createdAt: '2026-11-03T14:01:30+05:30',
    localDate: '2026-11-03'
  });
}

