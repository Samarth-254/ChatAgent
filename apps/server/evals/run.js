import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
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

// Check if plumbing (mock) mode requested via flag
const isPlumbing = process.argv.includes('--mock') || process.argv.includes('--plumbing');
const shouldResume = process.argv.includes('--resume');

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function runEvals() {
  let gitCommit = 'unknown';
  try {
    gitCommit = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {}

  console.log('\n========================================================================================');
  if (isPlumbing) {
    console.log('PLUMBING (fake LLM + fake search): tests dates, recall, routing, loop. Not model quality.');
    console.log('Notice: Never quote plumbing latency as model performance.');
  } else {
    console.log('   ChatAgent Monorepo Live Evaluation Runner');
    console.log(`   Model: ${config.llm.deepModel} (Fast: ${config.llm.fastModel})`);
    console.log(`   Git Commit: ${gitCommit} | Reference Time: 2026-11-10T09:00:00+05:30`);
  }
  console.log('   Storage: Real Neon PostgreSQL');
  console.log('========================================================================================\n');

  const evalClock = clock.createClock({
    fixedNow: '2026-11-10T09:00:00+05:30',
    userTz: process.env.USER_TZ || 'Asia/Kolkata'
  });

  const db = createDb();
  const { sessionRepo, messageRepo } = await seedEvalDb(db);

  const chatTurnUseCase = new ChatTurnUseCase({
    sessionRepository: sessionRepo,
    messageRepository: messageRepo,
    llmPort: isPlumbing ? { streamChat: fakeStreamChat } : { streamChat },
    searchPort: isPlumbing ? { search: fakeSearch } : { search },
    clockPort: evalClock,
    fastModel: config.llm.fastModel,
    deepModel: config.llm.deepModel
  });

  const casesPath = path.join(__dirname, 'cases.json');
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

  const resultsFileName = isPlumbing ? 'results-plumbing.json' : 'results-real.json';
  const resultsPath = path.join(rootDir, 'evals', resultsFileName);

  const existingPassedMap = new Map();
  if (shouldResume && fs.existsSync(resultsPath)) {
    try {
      const prevData = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      if (Array.isArray(prevData.results)) {
        for (const r of prevData.results) {
          if (r.passed) {
            existingPassedMap.set(r.id, r);
          }
        }
        console.log(`[Resume Mode] Loaded ${existingPassedMap.size} previously passed cases from evals/${resultsFileName}\n`);
      }
    } catch (e) {
      console.warn(`[Resume Mode] Could not read existing results: ${e.message}`);
    }
  }

  const results = [];
  const ttfts = [];
  const totalTimes = [];
  const searchCounts = [];
  let quotaExhausted = false;
  let quotaExhaustedReason = '';

  try {
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];

      if (existingPassedMap.has(c.id)) {
        const prev = existingPassedMap.get(c.id);
        results.push(prev);
        if (typeof prev.ttftMs === 'number') ttfts.push(prev.ttftMs);
        if (typeof prev.totalMs === 'number') totalTimes.push(prev.totalMs);
        if (typeof prev.searches === 'number') searchCounts.push(prev.searches);
        console.log(`[${String(i + 1).padStart(2, '0')}/${cases.length}] ${c.id.padEnd(36)} \x1b[32mPASS\x1b[0m (${prev.ttftMs}ms TTFT, ${prev.totalMs}ms tot, ${prev.searches} srch) [RESUMED]`);
        continue;
      }

      if (quotaExhausted) {
        results.push({
          id: c.id,
          prompt: c.prompt,
          passed: false,
          searches: 0,
          queries: [],
          ttftMs: null,
          totalMs: null,
          failureReason: `Blocked: ${quotaExhaustedReason}`,
          responseExcerpt: ''
        });
        console.log(`[${String(i + 1).padStart(2, '0')}/${cases.length}] ${c.id.padEnd(36)} \x1b[33mBLOCKED\x1b[0m (${quotaExhaustedReason})`);
        continue;
      }

      if (i > 0 && !isPlumbing) {
        // 4s delay between real cases to respect provider rate limits
        await new Promise(r => setTimeout(r, 4000));
      }

      process.stdout.write(`[${String(i + 1).padStart(2, '0')}/${cases.length}] ${c.id.padEnd(36)} `);

      const sessionId = crypto.randomUUID();
      await sessionRepo.createSession(sessionId, EVAL_USER_ID, c.prompt.slice(0, 30));

      let firstTokenTime = null;
      let searchesIssued = 0;
      const queriesIssued = [];
      let turnRes = null;
      let totalTime = 0;
      let ttft = 0;
      let text = '';
      let searchCount = 0;
      let passed = false;
      const failures = [];

      let caseAttempt = 0;
      const maxCaseAttempts = isPlumbing ? 1 : 2; // 1 retry on timeout for live real mode

      while (caseAttempt < maxCaseAttempts) {
        caseAttempt++;
        firstTokenTime = null;
        searchesIssued = 0;
        queriesIssued.length = 0;

        const ctrl = new AbortController();
        const timeoutMs = isPlumbing ? 15000 : 60000; // 60s per-case timeout
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const startTime = Date.now();

        try {
          turnRes = await chatTurnUseCase.execute({
            userId: EVAL_USER_ID,
            sessionId,
            message: c.prompt,
            signal: ctrl.signal,
            onEvent: (event) => {
              if (event.type === 'token' && firstTokenTime === null) {
                firstTokenTime = Date.now() - startTime;
              }
              if (event.type === 'search.started') {
                searchesIssued++;
                if (event.payload?.query) queriesIssued.push(event.payload.query);
              }
            }
          });

          clearTimeout(timer);
          totalTime = Date.now() - startTime;
          ttft = firstTokenTime || totalTime;
          text = turnRes.text || '';
          searchCount = turnRes.meta?.searches?.length || searchesIssued;
          break;
        } catch (err) {
          clearTimeout(timer);
          const isTimeout = ctrl.signal.aborted || err.message?.includes('aborted') || err.message?.includes('timed out');
          const is429 = err.status === 429 || String(err.status) === '429' || String(err.message).includes('429') || String(err.message).toLowerCase().includes('rate limit');
          const isDailyQuota = String(err.message).toLowerCase().includes('resource_exhausted') || String(err.message).includes('per day limit');

          if (isDailyQuota) {
            quotaExhausted = true;
            quotaExhaustedReason = 'Provider free-tier daily quota limit reached (20 RPD)';
            failures.push(quotaExhaustedReason);
            break;
          }

          if (isTimeout && caseAttempt < maxCaseAttempts) {
            process.stdout.write('(timeout, retrying once...) ');
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }

          if (is429 && caseAttempt < maxCaseAttempts) {
            process.stdout.write('(429, waiting 10s...) ');
            await new Promise(r => setTimeout(r, 10000));
            continue;
          }

          failures.push(err.message || 'Unknown execution error');
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
      if (turnRes) {
        ttfts.push(ttft);
        totalTimes.push(totalTime);
        searchCounts.push(searchCount);
      }

      results.push({
        id: c.id,
        prompt: c.prompt,
        passed,
        searches: searchCount,
        queries: queriesIssued,
        ttftMs: turnRes ? ttft : null,
        totalMs: turnRes ? totalTime : null,
        failureReason: failures.length > 0 ? failures.join('; ') : null,
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

  const executedCases = results.filter(r => r.totalMs !== null);
  const passedCount = results.filter(r => r.passed).length;
  const passRate = executedCases.length > 0 ? ((passedCount / executedCases.length) * 100).toFixed(1) : '0.0';
  const p50TTFT = percentile(ttfts, 50);
  const p95TTFT = percentile(ttfts, 95);
  const p50Total = percentile(totalTimes, 50);
  const p95Total = percentile(totalTimes, 95);
  const avgSearches = searchCounts.length > 0 ? (searchCounts.reduce((a, b) => a + b, 0) / searchCounts.length).toFixed(1) : '0.0';

  const outputPayload = isPlumbing
    ? {
        mode: 'plumbing',
        notice: 'PLUMBING (fake LLM + fake search): tests dates, recall, routing, loop. Not model quality. Never quote its latency anywhere.',
        date: new Date().toISOString(),
        gitCommit,
        summary: {
          totalCases: results.length,
          passedCount,
          passRate: `${passRate}%`
        },
        results
      }
    : {
        mode: 'real',
        llmModel: config.llm.deepModel,
        fastModel: config.llm.fastModel,
        date: new Date().toISOString(),
        gitCommit,
        summary: {
          totalCases: results.length,
          executedCount: executedCases.length,
          passedCount,
          passRate: `${passRate}%`,
          p50TTFTMs: p50TTFT,
          p95TTFTMs: p95TTFT,
          p50TotalMs: p50Total,
          p95TotalMs: p95Total,
          avgSearchesPerQuery: parseFloat(avgSearches)
        },
        results
      };

  const evalsDir = path.dirname(resultsPath);
  if (!fs.existsSync(evalsDir)) fs.mkdirSync(evalsDir, { recursive: true });
  fs.writeFileSync(resultsPath, JSON.stringify(outputPayload, null, 2));

  console.log('\n========================================================================================');
  console.log(`                                ${isPlumbing ? 'PLUMBING TEST RESULTS TABLE' : 'REAL EVALUATION RESULTS TABLE'}                                `);
  console.log('========================================================================================');
  console.log('Case ID                                Status   Searches   TTFT (ms)   Total (ms)');
  console.log('----------------------------------------------------------------------------------------');
  for (const r of results) {
    const statusStr = r.passed ? '\x1b[32mPASS\x1b[0m  ' : (r.failureReason?.startsWith('Blocked:') ? '\x1b[33mBLOCK\x1b[0m ' : '\x1b[31mFAIL\x1b[0m  ');
    const ttftStr = r.ttftMs !== null ? String(r.ttftMs).padStart(9) : '        -';
    const totStr = r.totalMs !== null ? String(r.totalMs).padStart(10) : '         -';
    console.log(`${r.id.padEnd(38)} ${statusStr} ${String(r.searches).padStart(8)}   ${ttftStr}   ${totStr}`);
  }
  console.log('========================================================================================');
  console.log(`Pass Rate:       ${passRate}% (${passedCount}/${executedCases.length} executed, ${results.length} total)`);
  if (!isPlumbing && executedCases.length > 0) {
    console.log(`TTFT:            p50 = ${p50TTFT}ms, p95 = ${p95TTFT}ms`);
    console.log(`Total Latency:   p50 = ${p50Total}ms, p95 = ${p95Total}ms`);
    console.log(`Avg Searches:    ${avgSearches} per executed prompt`);
  }
  console.log('========================================================================================');
  console.log(`Report written to evals/${resultsFileName}\n`);
}

runEvals();
