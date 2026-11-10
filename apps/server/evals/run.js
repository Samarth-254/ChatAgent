import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { PGliteDb } from '../src/infrastructure/storage/postgres/pgliteDb.js';
import { seedEvalDb, EVAL_USER_ID } from './seed.js';
import { ChatTurnUseCase } from '../src/application/chatTurnUseCase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../');

process.env.FIXED_NOW = '2026-11-10T09:00:00+05:30';
process.env.USER_TZ = process.env.USER_TZ || 'Asia/Kolkata';

// Check if mock mode requested via flag or env
const isMock = process.argv.includes('--mock') || process.env.MOCK_LLM === '1' || !process.env.LLM_API_KEY;
if (isMock) {
  process.env.MOCK_LLM = '1';
  process.env.MOCK_SEARCH = '1';
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runEvals() {
  console.log('\n======================================================');
  console.log('   ChatAgent Monorepo Evaluation Runner');
  console.log(`   Mode: ${isMock ? 'Deterministic Mock / Offline' : 'Live Real APIs'}`);
  console.log('   Frozen Reference Time: 2026-11-10T09:00:00+05:30');
  console.log('======================================================\n');

  // Use isolated in-memory PGlite for eval
  const db = new PGliteDb(':memory:');
  const { sessionRepo, messageRepo } = await seedEvalDb(db);
  const chatTurnUseCase = new ChatTurnUseCase({ sessionRepository: sessionRepo, messageRepository: messageRepo });

  const casesPath = path.join(__dirname, 'cases.json');
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

  const results = [];
  const ttfts = [];
  const totalTimes = [];
  const searchCounts = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    process.stdout.write(`[${String(i + 1).padStart(2, '0')}/${cases.length}] ${c.id.padEnd(36)} `);

    const sessionId = crypto.randomUUID();
    await sessionRepo.createSession(sessionId, EVAL_USER_ID, c.prompt.slice(0, 30));

    let firstTokenTime = null;
    const startTime = Date.now();
    let searchesIssued = 0;

    try {
      const turnRes = await chatTurnUseCase.execute({
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

      const totalTime = Date.now() - startTime;
      const ttft = firstTokenTime || totalTime;
      const text = turnRes.text || '';
      const searchCount = turnRes.meta?.searches?.length || searchesIssued;

      const failures = [];
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

      const passed = failures.length === 0;
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
    } catch (err) {
      console.log(`\x1b[31mERROR\x1b[0m: ${err.message}`);
      results.push({
        id: c.id,
        prompt: c.prompt,
        passed: false,
        failures: [err.message],
        ttftMs: 0,
        totalTimeMs: 0,
        searchCount: 0
      });
    }
  }

  await db.close();

  const passedCount = results.filter(r => r.passed).length;
  const passRate = ((passedCount / results.length) * 100).toFixed(1);
  const p50TTFT = percentile(ttfts, 50);
  const p95TTFT = percentile(ttfts, 95);
  const p50Total = percentile(totalTimes, 50);
  const p95Total = percentile(totalTimes, 95);
  const avgSearches = (searchCounts.reduce((a, b) => a + b, 0) / searchCounts.length).toFixed(1);

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

  console.log('\n======================================================');
  console.log('   EVALUATION SUMMARY');
  console.log('======================================================');
  console.log(`Pass Rate:       ${summary.passRate} (${passedCount}/${results.length})`);
  console.log(`TTFT:            p50 = ${p50TTFT}ms, p95 = ${p95TTFT}ms`);
  console.log(`Total Latency:   p50 = ${p50Total}ms, p95 = ${p95Total}ms`);
  console.log(`Avg Searches:    ${avgSearches} per prompt`);
  console.log('======================================================');
  console.log(`Report written to evals/results.json\n`);
}

runEvals();

