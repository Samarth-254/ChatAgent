import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { streamChat } from '../src/infrastructure/llm/llm.js';
import { search } from '../src/infrastructure/search/search.js';
import * as clock from '../src/infrastructure/clock/clock.js';
import { createDb } from '../src/infrastructure/storage/postgres/createDb.js';
import { seedEvalDb, cleanEvalDb, EVAL_USER_ID } from './seed.js';
import { config } from '../src/config/index.js';
import { ChatTurnUseCase } from '../src/application/chatTurnUseCase.js';
import { fakeStreamChat } from './fakes/fakeLlm.js';
import { fakeSearch } from './fakes/fakeSearch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../');

process.env.FIXED_NOW = '2026-11-10T09:00:00+05:30';
process.env.USER_TZ = process.env.USER_TZ || 'Asia/Kolkata';

// Check if mock mode requested via flag
const isMock = process.argv.includes('--mock');

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runEvals() {
  console.log('\n======================================================');
  console.log('   ChatAgent Monorepo Evaluation Runner');
  console.log(`   Mode: ${isMock ? 'Deterministic Mock Fakes' : 'Live Real APIs (Gemini + Tavily)'}`);
  console.log('   Storage: Real Neon PostgreSQL');
  console.log('   Frozen Reference Time: 2026-11-10T09:00:00+05:30');
  console.log('======================================================\n');

  const db = createDb();
  const { sessionRepo, messageRepo } = await seedEvalDb(db);

  // Build composition root (inject fakes only if isMock)
  const chatTurnUseCase = new ChatTurnUseCase({
    sessionRepository: sessionRepo,
    messageRepository: messageRepo,
    llmPort: isMock ? { streamChat: fakeStreamChat } : { streamChat },
    searchPort: isMock ? { search: fakeSearch } : { search },
    clockPort: clock,
    fastModel: config.llm.fastModel,
    deepModel: config.llm.deepModel
  });

  const casesPath = path.join(__dirname, 'cases.json');
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

  const results = [];
  const ttfts = [];
  const totalTimes = [];
  const searchCounts = [];

  try {
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      if (i > 0 && !isMock) {
        // Delay between live API cases to respect provider rate limits (e.g. 15 RPM)
        await new Promise(r => setTimeout(r, 2500));
      }

      process.stdout.write(`[${String(i + 1).padStart(2, '0')}/${cases.length}] ${c.id.padEnd(36)} `);

      const sessionId = crypto.randomUUID();
      await sessionRepo.createSession(sessionId, EVAL_USER_ID, c.prompt.slice(0, 30));

      let firstTokenTime = null;
      let searchesIssued = 0;
      let turnRes = null;
      let totalTime = 0;
      let ttft = 0;
      let text = '';
      let searchCount = 0;
      let passed = false;
      const failures = [];

      let attempt = 0;
      while (attempt < 3) {
        attempt++;
        try {
          const startTime = Date.now();
          firstTokenTime = null;
          searchesIssued = 0;

          turnRes = await chatTurnUseCase.execute({
            userId: EVAL_USER_ID,
            sessionId,
            message: c.prompt,
            onEvent: (event) => {
              if (event.type === 'token' && firstTokenTime === null) {
                firstTokenTime = Date.now() - startTime;
              }
              if (event.type === 'search.started') {
                searchesIssued++;
              }
            }
          });

          totalTime = Date.now() - startTime;
          ttft = firstTokenTime || totalTime;
          text = turnRes.text || '';
          searchCount = turnRes.meta?.searches?.length || searchesIssued;
          break;
        } catch (err) {
          const is429 = err.status === 429 || String(err.status) === '429' || err.message?.includes('429') || err.message?.includes('rate');
          if (is429 && attempt < 4) {
            await new Promise(r => setTimeout(r, 6000 * attempt));
            continue;
          }
          failures.push(err.message);
          break;
        }
      }

      if (turnRes) {
        if (c.expectSearch !== undefined) {
          if (c.expectSearch && searchCount === 0) {
            failures.push('Expected search to be issued, but none was called.');
          } else if (!c.expectSearch && searchCount > 0) {
            failures.push(`Expected NO search, but issued ${searchCount} searches.`);
          }
        }

        if (c.minParallelSearches && searchCount < c.minParallelSearches) {
          failures.push(`Expected >= ${c.minParallelSearches} parallel searches, got ${searchCount}`);
        }

        if (c.mustMatch) {
          for (const pattern of c.mustMatch) {
            if (!new RegExp(pattern, 'i').test(text)) {
              failures.push(`Failed to match /${pattern}/i`);
            }
          }
        }

        if (c.mustNotMatch) {
          for (const pattern of c.mustNotMatch) {
            if (new RegExp(pattern, 'i').test(text)) {
              failures.push(`Matched forbidden /${pattern}/i`);
            }
          }
        }
      }

      passed = failures.length === 0;
      ttfts.push(ttft);
      totalTimes.push(totalTime);
      searchCounts.push(searchCount);

      results.push({
        id: c.id,
        prompt: c.prompt,
        passed,
        failures,
        ttftMs: ttft,
        totalTimeMs: totalTime,
        searchCount,
        responseExcerpt: text.slice(0, 140).replace(/\n/g, ' ')
      });

      if (passed) {
        console.log(`\x1b[32mPASS\x1b[0m (${ttft}ms TTFT, ${totalTime}ms tot, ${searchCount} srch)`);
      } else {
        console.log(`\x1b[31mFAIL\x1b[0m (${failures.join('; ')})`);
      }
    }
  } finally {
    console.log('\nCleaning up eval records from Neon database...');
    await cleanEvalDb(db);
    await db.close();
  }

  const passedCount = results.filter(r => r.passed).length;
  const passRate = ((passedCount / results.length) * 100).toFixed(1);
  const p50TTFT = percentile(ttfts, 50);
  const p95TTFT = percentile(ttfts, 95);
  const p50Total = percentile(totalTimes, 50);
  const p95Total = percentile(totalTimes, 95);
  const avgSearches = (searchCounts.reduce((a, b) => a + b, 0) / (searchCounts.length || 1)).toFixed(1);

  const summary = {
    totalCases: results.length,
    passedCount,
    passRate: `${passRate}%`,
    latency: {
      p50TTFTMs: p50TTFT,
      p95TTFTMs: p95TTFT,
      p50TotalMs: p50Total,
      p95TotalMs: p95Total
    },
    avgSearchesPerQuery: parseFloat(avgSearches),
    mode: isMock ? 'mock' : 'live',
    timestamp: new Date().toISOString()
  };

  const resultsPath = path.join(rootDir, 'evals', 'results.json');
  const evalsDir = path.dirname(resultsPath);
  if (!fs.existsSync(evalsDir)) fs.mkdirSync(evalsDir, { recursive: true });
  fs.writeFileSync(resultsPath, JSON.stringify({ summary, results }, null, 2));

  console.log('\n========================================================================================');
  console.log('                                EVALUATION RESULTS TABLE                                ');
  console.log('========================================================================================');
  console.log('Case ID                                Status   Searches   TTFT (ms)   Total (ms)');
  console.log('----------------------------------------------------------------------------------------');
  for (const r of results) {
    const statusStr = r.passed ? '\x1b[32mPASS\x1b[0m  ' : '\x1b[31mFAIL\x1b[0m  ';
    console.log(`${r.id.padEnd(38)} ${statusStr} ${String(r.searchCount).padStart(8)}   ${String(r.ttftMs).padStart(9)}   ${String(r.totalTimeMs).padStart(10)}`);
  }
  console.log('========================================================================================');
  console.log(`Pass Rate:       ${summary.passRate} (${passedCount}/${results.length})`);
  console.log(`TTFT:            p50 = ${p50TTFT}ms, p95 = ${p95TTFT}ms`);
  console.log(`Total Latency:   p50 = ${p50Total}ms, p95 = ${p95Total}ms`);
  console.log(`Avg Searches:    ${avgSearches} per prompt`);
  console.log('========================================================================================');
  console.log(`Report written to evals/results.json\n`);
}

runEvals();
