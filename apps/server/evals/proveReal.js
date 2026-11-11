import 'dotenv/config';
import crypto from 'crypto';
import { createDb } from '../src/infrastructure/storage/postgres/createDb.js';
import { runMigrations } from '../src/infrastructure/storage/postgres/migrationRunner.js';
import { PostgresSessionRepository } from '../src/infrastructure/storage/postgres/postgresSessionRepository.js';
import { PostgresMessageRepository } from '../src/infrastructure/storage/postgres/postgresMessageRepository.js';
import { streamChat } from '../src/infrastructure/llm/llm.js';
import { search } from '../src/infrastructure/search/search.js';
import * as clock from '../src/infrastructure/clock/clock.js';
import { ChatTurnUseCase } from '../src/application/chatTurnUseCase.js';

process.env.FIXED_NOW = '2026-11-10T09:00:00+05:30';
process.env.USER_TZ = 'Asia/Kolkata';

async function main() {
  console.log('\n=============================================================');
  console.log(' PROVING REAL PATH: Live Gemini + Live Tavily + Real Neon');
  console.log(' Reference Time: 2026-11-10T09:00:00+05:30 (Tuesday)');
  console.log('=============================================================\n');

  const db = createDb();
  await runMigrations(db);

  const sessionRepo = new PostgresSessionRepository(db);
  const messageRepo = new PostgresMessageRepository(db);
  const useCase = new ChatTurnUseCase({
    sessionRepository: sessionRepo,
    messageRepository: messageRepo,
    llmPort: { streamChat },
    searchPort: { search },
    clockPort: clock
  });

  const testUserId = crypto.randomUUID();
  await sessionRepo.ensureUser(testUserId);

  try {
    // -------------------------------------------------------------
    // SEED TEST USER WITH PRIOR MEMORY (Monday CRM & Nov 3 Postgres)
    // -------------------------------------------------------------
    const crmSessionId = crypto.randomUUID();
    await sessionRepo.createSession(crmSessionId, testUserId, 'CRM Shortlist');
    await messageRepo.saveMessage({
      id: crypto.randomUUID(),
      sessionId: crmSessionId,
      userId: testUserId,
      role: 'user',
      content: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team: HubSpot, Pipedrive, Zoho CRM, Salesforce, Freshsales.',
      createdAt: '2026-11-09T10:00:00+05:30',
      localDate: '2026-11-09'
    });
    await messageRepo.saveMessage({
      id: crypto.randomUUID(),
      sessionId: crmSessionId,
      userId: testUserId,
      role: 'assistant',
      content: `Here is the shortlist for a 20-person sales team as of Monday, 9 November 2026:
1. **HubSpot Sales Hub**: $50/user/month (Professional tier).
2. **Pipedrive**: $24/user/month (Advanced plan).
3. **Zoho CRM**: $20/user/month (Professional edition).
4. **Salesforce Sales Cloud**: $25/user/month (Starter Suite) or $100/user/month (Pro).
5. **Freshsales**: $15/user/month (Growth) or $39/user/month (Pro).`,
      createdAt: '2026-11-09T10:01:00+05:30',
      localDate: '2026-11-09',
      meta: {
        model: 'gemini-2.5-flash',
        searches: [{ query: 'HubSpot CRM pricing 2026', afterDate: '2026-11-09' }],
        sources: [{ title: 'HubSpot Pricing', domain: 'hubspot.com' }],
        searchDate: '2026-11-09'
      }
    });

    const pgSessionId = crypto.randomUUID();
    await sessionRepo.createSession(pgSessionId, testUserId, 'Postgres Hosting');
    await messageRepo.saveMessage({
      id: crypto.randomUUID(),
      sessionId: pgSessionId,
      userId: testUserId,
      role: 'user',
      content: 'What are the best serverless Postgres hosting providers in 2026?',
      createdAt: '2026-11-03T11:00:00+05:30',
      localDate: '2026-11-03'
    });
    await messageRepo.saveMessage({
      id: crypto.randomUUID(),
      sessionId: pgSessionId,
      userId: testUserId,
      role: 'assistant',
      content: 'The leading serverless Postgres providers are Supabase ($25/mo Pro) and Neon ($19/mo Launch, $69/mo Scale). Both offer autoscaling storage and instant branching.',
      createdAt: '2026-11-03T11:01:30+05:30',
      localDate: '2026-11-03',
      meta: {
        model: 'gemini-2.5-flash',
        searches: [{ query: 'serverless postgres hosting 2026', afterDate: '2026-11-03' }],
        sources: [{ title: 'Neon Pricing', domain: 'neon.tech' }, { title: 'Supabase Pricing', domain: 'supabase.com' }],
        searchDate: '2026-11-03'
      }
    });

    // -------------------------------------------------------------
    // RUN CHALLENGE PROMPTS
    // -------------------------------------------------------------
    const prompts = [
      {
        num: 1,
        title: 'PROMPT 1: CRM Shortlist Since Monday',
        text: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?'
      },
      {
        num: 2,
        title: 'PROMPT 2: Re-verify 3 November Question',
        text: 'What did I ask you on 3 November? Is your answer still correct today?'
      },
      {
        num: 3,
        title: 'PROMPT 3: Last Tuesday Postgres Hosting Pricing Changes',
        text: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?'
      }
    ];

    for (const p of prompts) {
      console.log(`\n======================================================`);
      console.log(` ${p.title}`);
      console.log(` Prompt: "${p.text}"`);
      console.log(`======================================================`);

      const currentSessionId = crypto.randomUUID();
      await sessionRepo.createSession(currentSessionId, testUserId, p.text.slice(0, 30));

      let ttftMs = null;
      let dateNote = null;
      const searches = [];
      const startTime = Date.now();

      const res = await useCase.execute({
        userId: testUserId,
        sessionId: currentSessionId,
        message: p.text,
        onEvent: (event) => {
          if (event.type === 'token' && ttftMs === null) {
            ttftMs = Date.now() - startTime;
          }
          if (event.type === 'date.resolved') {
            dateNote = event.payload?.dateNote;
          }
          if (event.type === 'search.started') {
            searches.push({ query: event.payload.query, afterDate: event.payload.afterDate });
          }
        }
      });

      const totalTimeMs = Date.now() - startTime;

      console.log(`Date Note:    ${dateNote || 'None'}`);
      console.log(`Searches:     ${searches.length} queries issued:`);
      searches.forEach((s, idx) => console.log(`  [${idx + 1}] query: "${s.query}", after_date: ${s.afterDate || 'none'}`));
      console.log(`TTFT:         ${ttftMs || totalTimeMs}ms`);
      console.log(`Total Time:   ${totalTimeMs}ms`);
      console.log(`\nFinal Answer:\n------------------------------------------------------`);
      console.log(res.text);
      console.log(`------------------------------------------------------`);
      console.log(`Sources cited (${res.meta?.sources?.length || 0}):`);
      (res.meta?.sources || []).forEach(s => console.log(`  - [${s.domain}] ${s.title} (${s.url})`));
    }

    // -------------------------------------------------------------
    // NO-HISTORY CASE: Fresh User with no stored messages
    // -------------------------------------------------------------
    console.log(`\n======================================================`);
    console.log(` NO-HISTORY CASE: Fresh user asks about 3 November`);
    console.log(` Prompt: "What did I ask you on 3 November?"`);
    console.log(`======================================================`);

    const freshUserId = crypto.randomUUID();
    await sessionRepo.ensureUser(freshUserId);
    const freshSessionId = crypto.randomUUID();
    await sessionRepo.createSession(freshSessionId, freshUserId, 'Fresh No History');

    const freshStartTime = Date.now();
    let freshTtft = null;
    const freshRes = await useCase.execute({
      userId: freshUserId,
      sessionId: freshSessionId,
      message: 'What did I ask you on 3 November?',
      onEvent: (event) => {
        if (event.type === 'token' && freshTtft === null) {
          freshTtft = Date.now() - freshStartTime;
        }
      }
    });
    const freshTotal = Date.now() - freshStartTime;

    console.log(`TTFT:       ${freshTtft || freshTotal}ms`);
    console.log(`Total Time: ${freshTotal}ms`);
    console.log(`\nFinal Answer:\n------------------------------------------------------`);
    console.log(freshRes.text);
    console.log(`------------------------------------------------------`);

    // Clean up fresh user
    await db.query('DELETE FROM messages WHERE user_id = $1', [freshUserId]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [freshUserId]);
    await db.query('DELETE FROM users WHERE id = $1', [freshUserId]);

  } finally {
    console.log('\nCleaning up test user data from Neon database...');
    await db.query('DELETE FROM messages WHERE user_id = $1', [testUserId]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [testUserId]);
    await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await db.close();
    console.log('Cleanup complete.\n');
  }
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

