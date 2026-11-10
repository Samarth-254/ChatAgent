import * as chrono from 'chrono-node';

/**
 * Returns current timestamp as Date object.
 * Uses FIXED_NOW if specified (for deterministic evals), otherwise system time.
 */
export function getNow() {
  if (process.env.FIXED_NOW) {
    const fixed = new Date(process.env.FIXED_NOW);
    if (!isNaN(fixed.getTime())) {
      return fixed;
    }
  }
  return new Date();
}

/**
 * Returns configured or system IANA timezone.
 */
export function getTimezone() {
  return process.env.USER_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * Computes offset string like "UTC+05:30" or "UTC-05:00" for a given date & timezone.
 */
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
  } catch {
    // fallback
  }
  return 'UTC+00:00';
}

/**
 * Formats full system clock block:
 * "Today is Tuesday, 10 November 2026, 14:32 Asia/Kolkata (UTC+05:30)."
 */
export function formatClockBlock(date = getNow(), timeZone = getTimezone()) {
  const weekday = date.toLocaleString('en-US', { timeZone, weekday: 'long' });
  const day = date.toLocaleString('en-US', { timeZone, day: 'numeric' });
  const month = date.toLocaleString('en-US', { timeZone, month: 'long' });
  const year = date.toLocaleString('en-US', { timeZone, year: 'numeric' });
  const time = date.toLocaleString('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
  const offset = getTimezoneOffsetStr(date, timeZone);

  return `Today is ${weekday}, ${day} ${month} ${year}, ${time} ${timeZone} (${offset}).`;
}

/**
 * Formats a Date to YYYY-MM-DD in the target timezone.
 */
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

/**
 * Deterministically resolves relative dates in the user's prompt using chrono-node.
 * Produces structured date ranges and the formatted [date note: ...] tag.
 */
export function resolveRelativeDates(text, refDate = getNow(), timeZone = getTimezone()) {
  if (!text || typeof text !== 'string') {
    return { textWithNote: text, dateNote: null, resolvedDates: [] };
  }

  // Ref date for chrono (past-biased by default)
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

    // If resolved date is today and user said e.g. "Monday" alone on Monday evening,
    // or if chrono accidentally resolved to future, bias to past.
    if (iso > todayIso) {
      const pastStart = new Date(startDate);
      pastStart.setFullYear(pastStart.getFullYear() - 1);
      iso = formatLocalDate(pastStart, timeZone);
    }

    const weekdayShort = startDate.toLocaleString('en-US', { timeZone, weekday: 'short' });
    const isPast = iso <= todayIso;

    let noteItem = `"${raw}" = ${iso} (${weekdayShort})`;
    let afterDate = null;

    if (hasSince && isPast) {
      afterDate = iso;
    }

    resolvedDates.push({
      raw,
      iso,
      startDate,
      endDate: match.end ? match.end.date() : null,
      afterDate,
      isPast
    });

    notes.push(noteItem);
  }

  // Handle explicit "since" note
  if (hasSince && resolvedDates.length > 0 && resolvedDates[0].afterDate) {
    notes.push(`"since" = after ${resolvedDates[0].afterDate}`);
  }

  let dateNote = null;
  let textWithNote = text;

  if (notes.length > 0) {
    dateNote = `[date note: ${notes.join('; ')}]`;
    textWithNote = `${text}\n\n${dateNote}`;
  }

  return {
    textWithNote,
    dateNote,
    resolvedDates
  };
}
