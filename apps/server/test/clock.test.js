import test from 'node:test';
import assert from 'node:assert/strict';
import { formatClockBlock, resolveRelativeDates } from '../src/infrastructure/clock/clock.js';

test('Clock: formats canonical clock block with timezone offset', () => {
  const ref = new Date('2026-11-10T09:00:00+05:30');
  const clock = formatClockBlock(ref, 'Asia/Kolkata');
  assert.match(clock, /Tuesday, 10 November 2026/);
  assert.match(clock, /09:00 Asia\/Kolkata/);
  assert.match(clock, /UTC\+05:30/);
});

test('Clock: resolves "last Tuesday" on Wed 11 Nov to previous week Tuesday (primary) and yesterday (secondary)', () => {
  const ref = new Date('2026-11-11T12:00:00+05:30'); // Wednesday 11 Nov
  const res = resolveRelativeDates('Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?', ref, 'Asia/Kolkata');
  assert.ok(res.resolvedDates.length > 0);
  const d = res.resolvedDates[0];
  assert.equal(d.primaryCandidate, '2026-11-03');
  assert.deepEqual(d.candidates, ['2026-11-03', '2026-11-10']);
  assert.match(res.dateNote, /2026-11-03/);
});

test('Clock: resolves "Monday" on Wed 11 Nov to most recent Monday', () => {
  const ref = new Date('2026-11-11T12:00:00+05:30'); // Wednesday 11 Nov
  const res = resolveRelativeDates('On Monday we shortlisted 5 CRM tools. Any pricing changes since?', ref, 'Asia/Kolkata');
  assert.ok(res.resolvedDates.length > 0);
  const d = res.resolvedDates[0];
  assert.equal(d.primaryCandidate, '2026-11-09');
  assert.deepEqual(d.candidates, ['2026-11-09', '2026-11-02']);
  assert.match(res.dateNote, /2026-11-09/);
});

test('Clock: resolves "3 November" with year rollover when in future', () => {
  // If reference date is 15 January 2027, "3 November" must roll back to 3 November 2026
  const ref = new Date('2027-01-15T12:00:00+05:30');
  const res = resolveRelativeDates('What did I ask you on 3 November?', ref, 'Asia/Kolkata');
  assert.ok(res.resolvedDates.length > 0);
  assert.equal(res.resolvedDates[0].iso, '2026-11-03');
});

test('Clock: resolves "yesterday" on Wed 11 Nov to Tuesday 10 Nov', () => {
  const ref = new Date('2026-11-11T12:00:00+05:30'); // Wednesday 11 Nov
  const res = resolveRelativeDates('What did we talk about yesterday?', ref, 'Asia/Kolkata');
  assert.ok(res.resolvedDates.length > 0);
  assert.equal(res.resolvedDates[0].iso, '2026-11-10');
});

test('Clock: Table-driven test across 7 "today" weekdays x 7 target weekdays', () => {
  // Days: Sun Nov 8 to Sat Nov 14, 2026
  const baseDates = [
    { day: 'Sunday', dateStr: '2026-11-08T12:00:00Z' },
    { day: 'Monday', dateStr: '2026-11-09T12:00:00Z' },
    { day: 'Tuesday', dateStr: '2026-11-10T12:00:00Z' },
    { day: 'Wednesday', dateStr: '2026-11-11T12:00:00Z' },
    { day: 'Thursday', dateStr: '2026-11-12T12:00:00Z' },
    { day: 'Friday', dateStr: '2026-11-13T12:00:00Z' },
    { day: 'Saturday', dateStr: '2026-11-14T12:00:00Z' }
  ];

  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (const today of baseDates) {
    const refDate = new Date(today.dateStr);
    const todayIso = today.dateStr.slice(0, 10);

    for (const targetWd of weekdayNames) {
      for (const phrase of [`last ${targetWd}`, targetWd]) {
        const res = resolveRelativeDates(`I asked you on ${phrase} about postgres`, refDate, 'UTC');
        assert.ok(res.resolvedDates.length > 0, `Must resolve ${phrase} from ${today.day}`);
        const d = res.resolvedDates[0];

        // 1. All candidates must be strictly before today
        for (const c of d.candidates) {
          assert.ok(c < todayIso, `Candidate ${c} for "${phrase}" on ${today.day} must be strictly before ${todayIso}`);
        }

        // 2. Must contain strictly-past most recent and 7 days prior
        assert.ok(d.candidates.length >= 2, `Must have at least 2 candidates for ${phrase}`);
        const sorted = [...d.candidates].sort().reverse();
        const mostRecent = sorted[0];
        const prevOccurrence = sorted[1];

        // Diff between consecutive weekly occurrences must be 7 days
        const diffMs = new Date(mostRecent).getTime() - new Date(prevOccurrence).getTime();
        assert.equal(diffMs, 7 * 24 * 3600 * 1000, `Candidates must be 7 days apart`);
      }
    }
  }
});

test('Clock: Server composition ignores FIXED_NOW in production/server mode', async () => {
  const { execSync } = await import('child_process');
  const code = `
    process.env.NODE_ENV = 'production';
    process.env.FIXED_NOW = '2020-01-01T00:00:00Z';
    const { config } = await import('./src/config/index.js');
    const clock = await import('./src/infrastructure/clock/clock.js');
    const now = clock.getNow();
    const isRealTime = Math.abs(Date.now() - now.getTime()) < 10000;
    if (!isRealTime || config.clock.fixedNow !== null) {
      process.exit(1);
    }
    process.exit(0);
  `;
  const result = execSync(`node --input-type=module -e "${code.replace(/\n/g, ' ')}"`);
  assert.equal(result.toString(), '');
});
