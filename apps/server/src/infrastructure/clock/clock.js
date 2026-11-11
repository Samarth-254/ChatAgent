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

import { resolveRelativeDates as domainResolveRelativeDates, formatLocalDateParts } from '../../domain/relativeDates.js';

export function formatLocalDate(date, timeZone = getTimezone()) {
  return formatLocalDateParts(date, timeZone);
}

export function resolveRelativeDates(text, refDate = getNow(), timeZone = getTimezone()) {
  return domainResolveRelativeDates(text, refDate, timeZone);
}

