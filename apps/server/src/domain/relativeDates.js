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

      // 1. Most recent occurrence strictly before today
      const occ1 = new Date(refDate);
      occ1.setDate(refDate.getDate() - daysBack);
      const occ1Iso = formatLocalDateParts(occ1, timeZone);

      // 2. The occurrence 7 days before that
      const occ2 = new Date(refDate);
      occ2.setDate(refDate.getDate() - (daysBack + 7));
      const occ2Iso = formatLocalDateParts(occ2, timeZone);

      // 3. Occurrence in previous calendar week if different
      const startOfCurrentWeek = new Date(refDate);
      startOfCurrentWeek.setDate(refDate.getDate() - currentWeekday);
      const prevCalWeekOcc = new Date(startOfCurrentWeek);
      prevCalWeekOcc.setDate(startOfCurrentWeek.getDate() - 7 + wd.index);
      const prevCalWeekOccIso = formatLocalDateParts(prevCalWeekOcc, timeZone);

      let primaryCandidate = '';
      const raw = isLast ? `last ${wd.name}` : wd.name;

      if (isLast) {
        if (currentWeekday === wd.index) {
          // If today IS that weekday (e.g. today is Tuesday), "last Tuesday" must include 7 days ago as primary
          primaryCandidate = occ1Iso;
        } else {
          primaryCandidate = prevCalWeekOccIso;
        }
      } else {
        primaryCandidate = occ1Iso;
      }

      const rawCandidates = isLast
        ? [primaryCandidate, occ1Iso, occ2Iso, prevCalWeekOccIso]
        : [occ1Iso, occ2Iso, prevCalWeekOccIso];
      const candidates = [...new Set(rawCandidates)];

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

