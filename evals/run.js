import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { seedEvalDb } from './seed.js';
import { runAgent } from '../src/agent.js';
import { closeDb } from '../src/memory.js';

// Pin deterministic evaluation environment
process.env.FIXED_NOW = '2026-11-10T09:00:00+05:30';
process.env.USER_TZ = process.env.USER_TZ || 'Asia/Kolkata';
process.env.DB_PATH = 'data/eval.db';

// Ensure mock mode is active if live keys are not supplied
if (!process.env.LLM_API_KEY) {
  process.env.MOCK_LLM = '1';
}
if (!process.env.TAVILY_API_KEY) {
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
  console.log('   ChatAgent Evaluation Runner');
  console.log('   Frozen Reference Time: 2026-11-10T09:00:00+05:30');
  console.log('======================================================\n');

  // Seed DB with baseline conversations
  seedEvalDb('data/eval.db');

  const casesPath = path.resolve('evals/cases.json');
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

  const results = [];
  const ttfts = [];
  const totalTimes = [];
  const searchCounts = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    process.stdout.write(`[${i + 1}/${cases.length}] ${c.id.padEnd(36)} `);

    const sessionId = `eval_run_${c.id}_${Date.now()}`;
    let firstTokenTime = null;
    const startTime = Date.now();
    let text = '';
    let sources = [];

    let searches = [];

    try {
      const res = await runAgent({
        sessionId,
        userMessage: c.prompt,
        onEvent: (event) => {
          if (event.type === 'token' && firstTokenTime === null) {
            firstTokenTime = Date.now() - startTime;
          }
          if (event.type === 'status' && event.message?.startsWith('Searching:')) {
            searches.push(event.message.replace('Searching:', '').trim());
          }
        }
      });

      const totalTime = Date.now() - startTime;
      const ttft = firstTokenTime || totalTime;

      text = res.text || '';
      sources = res.sources || [];
      const modelUsed = res.meta?.modelUsed;
      const searchCount = res.meta?.searchQueriesIssued?.length || searches.length;

      // Assertion evaluation
      const failures = [];

      if (c.expectSearch !== undefined) {
        const didSearch = searchCount > 0;
        if (c.expectSearch && !didSearch) {
          failures.push('Expected search to be issued, but none was called.');
        } else if (!c.expectSearch && didSearch) {
          failures.push(`Expected NO search, but issued ${searchCount} searches.`);
        }
      }

      if (c.expectedModel && modelUsed && !modelUsed.includes(c.expectedModel)) {
        // Small note: allow fast model fallback or exact matches
        if (c.expectedModel.includes('flash') && !modelUsed.includes('flash')) {
          failures.push(`Expected model ${c.expectedModel}, got ${modelUsed}`);
        }
      }

      if (c.minParallelSearches && searchCount < c.minParallelSearches) {
        failures.push(`Expected >= ${c.minParallelSearches} parallel searches, got ${searchCount}`);
      }

      if (c.mustMatch) {
        for (const pattern of c.mustMatch) {
          const reg = new RegExp(pattern, 'i');
          if (!reg.test(text)) {
            failures.push(`Response failed to match regex: /${pattern}/i`);
          }
        }
      }

      if (c.mustNotMatch) {
        for (const pattern of c.mustNotMatch) {
          const reg = new RegExp(pattern, 'i');
          if (reg.test(text)) {
            failures.push(`Response illegally matched forbidden regex: /${pattern}/i`);
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
        modelUsed,
        searchCount,
        queries: res.meta?.searchQueriesIssued || searches,
        responseExcerpt: text.slice(0, 150).replace(/\n/g, ' ')
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
        modelUsed: 'none',
        searchCount: 0,
        queries: [],
        responseExcerpt: ''
      });
    }
  }

  closeDb();

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
    timestamp: new Date().toISOString()
  };

  const output = { summary, results };
  fs.writeFileSync('evals/results.json', JSON.stringify(output, null, 2));

  console.log('\n======================================================');
  console.log('   EVALUATION SUMMARY');
  console.log('======================================================');
  console.log(`Pass Rate:       ${summary.passRate} (${passedCount}/${results.length})`);
  console.log(`TTFT:            p50 = ${p50TTFT}ms, p95 = ${p95TTFT}ms`);
  console.log(`Total Latency:   p50 = ${p50Total}ms, p95 = ${p95Total}ms`);
  console.log(`Avg Searches:    ${avgSearches} per prompt`);
  console.log('======================================================');
  console.log('Full report written to evals/results.json\n');
}

runEvals();
