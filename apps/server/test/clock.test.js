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
