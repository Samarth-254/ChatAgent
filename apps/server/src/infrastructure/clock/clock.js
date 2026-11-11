import * as chrono from 'chrono-node';
import { config } from '../../config/index.js';

export function getNow() {
  if (config.clock.fixedNow) {
    const fixed = new Date(config.clock.fixedNow);
    if (!isNaN(fixed.getTime())) return fixed;
  }
  return new Date();
}

export function getTimezone() {
  return config.clock.userTz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function getTimezoneOffsetStr(date = getNow(), timeZone = getTimezone()) {
  try {
    const formatted = date.toLocaleString('en-US', { timeZone, timeZoneName: 'longOffset' });
    const match = formatted.match(/GMT([+-]\d{1,2}:?\d{2})?/);
    if (match) {
      if (!match[1]) return 'UTC+00:00';
      const sign = match[1][0];
      const raw = match[1].slice(1).replace(':', '');
      const hours = raw.slice(0, 2).padStart(2, '0');
      const mins = (raw.slice(2) || '00').padEnd(2, '0');
      return `UTC${sign}${hours}:${mins}`;
    }
  } catch {}
  return 'UTC+00:00';
}

export function formatClockBlock(date = getNow(), timeZone = getTimezone()) {
  const weekday = date.toLocaleString('en-US', { timeZone, weekday: 'long' });
  const day = date.toLocaleString('en-US', { timeZone, day: 'numeric' });
  const month = date.toLocaleString('en-US', { timeZone, month: 'long' });
  const year = date.toLocaleString('en-US', { timeZone, year: 'numeric' });
  const time = date.toLocaleString('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
  const offset = getTimezoneOffsetStr(date, timeZone);

  return `Today is ${weekday}, ${day} ${month} ${year}, ${time} ${timeZone} (${offset}).`;
}

export function formatLocalDate(date, timeZone = getTimezone()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

export function resolveRelativeDates(text, refDate = getNow(), timeZone = getTimezone()) {
  if (!text || typeof text !== 'string') {
    return { textWithNote: text, dateNote: null, resolvedDates: [] };
  }

  const parsed = chrono.parse(text, refDate, { forwardDate: false });
  const resolvedDates = [];
  const notes = [];
  const lowerText = text.toLowerCase();
  const hasSince = /\b(since|after|from)\b/i.test(lowerText);
  const todayIso = formatLocalDate(refDate, timeZone);

  for (const match of parsed) {
    const raw = match.text;
    const startDate = match.start.date();
    let iso = formatLocalDate(startDate, timeZone);

    if (iso > todayIso) {
      const pastStart = new Date(startDate);
      pastStart.setFullYear(pastStart.getFullYear() - 1);
      iso = formatLocalDate(pastStart, timeZone);
    }

    const weekdayShort = startDate.toLocaleString('en-US', { timeZone, weekday: 'short' });
    const isPast = iso <= todayIso;
    const noteItem = `"${raw}" = ${iso} (${weekdayShort})`;
    const afterDate = hasSince && isPast ? iso : null;

    resolvedDates.push({ raw, iso, startDate, endDate: match.end ? match.end.date() : null, afterDate, isPast });
    notes.push(noteItem);
  }

  if (hasSince && resolvedDates.length > 0 && resolvedDates[0].afterDate) {
    notes.push(`"since" = after ${resolvedDates[0].afterDate}`);
  }

  const dateNote = notes.length > 0 ? `[date note: ${notes.join('; ')}]` : null;
  const textWithNote = dateNote ? `${text}\n\n${dateNote}` : text;

  return { textWithNote, dateNote, resolvedDates };
}

