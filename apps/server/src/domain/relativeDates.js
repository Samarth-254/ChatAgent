import * as chrono from 'chrono-node';

export function formatLocalDateParts(date, timeZone = 'UTC') {
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

export function getWeekdayIndex(date, timeZone = 'UTC') {
  const weekdayShort = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekdayShort] ?? date.getDay();
}

const WEEKDAY_NAMES = [
  { name: 'sunday', index: 0, short: 'Sun' },
  { name: 'monday', index: 1, short: 'Mon' },
  { name: 'tuesday', index: 2, short: 'Tue' },
  { name: 'wednesday', index: 3, short: 'Wed' },
  { name: 'thursday', index: 4, short: 'Thu' },
  { name: 'friday', index: 5, short: 'Fri' },
  { name: 'saturday', index: 6, short: 'Sat' }
];

export function resolveRelativeDates(text, refDate = new Date(), timeZone = 'UTC') {
  if (!text || typeof text !== 'string') {
    return { textWithNote: text, dateNote: null, resolvedDates: [] };
  }

  const todayIso = formatLocalDateParts(refDate, timeZone);
  const currentWeekday = getWeekdayIndex(refDate, timeZone);
  const lowerText = text.toLowerCase();
  const hasSince = /\b(since|after|from)\b/i.test(lowerText);

  const resolvedDates = [];
  const notes = [];

  // 1. Detect weekday expressions explicitly
  for (const wd of WEEKDAY_NAMES) {
    const lastPattern = new RegExp(`\\blast\\s+${wd.name}\\b`, 'i');
    const plainPattern = new RegExp(`\\b${wd.name}\\b`, 'i');

    const isLast = lastPattern.test(lowerText);
    const isPlain = !isLast && plainPattern.test(lowerText);

    if (isLast || isPlain) {
      let daysBack = (currentWeekday - wd.index + 7) % 7;
      if (daysBack === 0) daysBack = 7; // strictly past weekday, not today

      const mostRecent = new Date(refDate);
      mostRecent.setDate(refDate.getDate() - daysBack);
      const mostRecentIso = formatLocalDateParts(mostRecent, timeZone);

      const prevWeek = new Date(refDate);
      prevWeek.setDate(refDate.getDate() - (daysBack + 7));
      const prevWeekIso = formatLocalDateParts(prevWeek, timeZone);

      let candidates = [];
      let primaryCandidate = '';
      const raw = isLast ? `last ${wd.name}` : wd.name;

      if (isLast) {
        // "last Tuesday" on Wed 11 Nov -> primary is Tuesday of previous week (2026-11-03)
        primaryCandidate = prevWeekIso;
        candidates = [prevWeekIso, mostRecentIso];
      } else {
        // "Monday" on Wed 11 Nov -> primary is most recent past Monday (2026-11-09)
        primaryCandidate = mostRecentIso;
        candidates = [mostRecentIso, prevWeekIso];
      }

      resolvedDates.push({
        raw,
        iso: primaryCandidate,
        primaryCandidate,
        candidates,
        afterDate: primaryCandidate,
        isPast: true,
        isWeekday: true,
        weekday: wd.name
      });

      notes.push(`"${raw}" candidates = [${candidates.join(', ')}], primary = ${primaryCandidate} (${wd.short})`);
      break; // one primary weekday per query
    }
  }

  // 2. Chrono parser for specific dates (e.g. "3 November", "yesterday", "25 October")
  const parsed = chrono.parse(text, refDate, { forwardDate: false });
  for (const match of parsed) {
    const raw = match.text;
    const lowerRaw = raw.toLowerCase();

    // Skip if already captured by weekday logic above
    if (WEEKDAY_NAMES.some(wd => lowerRaw.includes(wd.name))) {
      continue;
    }

    const startDate = match.start.date();
    let iso = formatLocalDateParts(startDate, timeZone);

    // Year rollover: if parsed date is in future relative to todayIso, subtract 1 year
    if (iso > todayIso) {
      const pastDate = new Date(startDate);
      pastDate.setFullYear(pastDate.getFullYear() - 1);
      iso = formatLocalDateParts(pastDate, timeZone);
    }

    const isPast = iso <= todayIso;
    const weekdayShort = startDate.toLocaleString('en-US', { timeZone, weekday: 'short' });

    resolvedDates.push({
      raw,
      iso,
      primaryCandidate: iso,
      candidates: [iso],
      afterDate: hasSince && isPast ? iso : null,
      isPast,
      isWeekday: false
    });

    notes.push(`"${raw}" = ${iso} (${weekdayShort})`);
  }

  if (hasSince && resolvedDates.length > 0 && resolvedDates[0].afterDate) {
    notes.push(`"since" = after ${resolvedDates[0].afterDate}`);
  }

  const dateNote = notes.length > 0 ? `[date note: ${notes.join('; ')}]` : null;
  const textWithNote = dateNote ? `${text}\n\n${dateNote}` : text;

  return { textWithNote, dateNote, resolvedDates };
}

