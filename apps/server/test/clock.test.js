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

test('Clock: deterministically resolves "Monday" to previous Monday', () => {
  const ref = new Date('2026-11-10T09:00:00+05:30'); // Tuesday
  const res = resolveRelativeDates('On Monday we shortlisted 5 CRM tools. Any pricing changes since?', ref, 'Asia/Kolkata');
  assert.ok(res.dateNote);
  assert.match(res.dateNote, /2026-11-09/);
  assert.match(res.dateNote, /since.*after 2026-11-09/);
});

test('Clock: deterministically resolves "3 November" to previous 3 November', () => {
  const ref = new Date('2026-11-10T09:00:00+05:30');
  const res = resolveRelativeDates('What did I ask you on 3 November?', ref, 'Asia/Kolkata');
  assert.ok(res.dateNote);
  assert.match(res.dateNote, /2026-11-03/);
});

