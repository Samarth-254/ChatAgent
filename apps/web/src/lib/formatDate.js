export const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Format a date string into sidebar group buckets according to IST calendar dates.
 * @param {string|Date} dateStr
 * @returns {string}
 */
export function formatGroupDate(dateStr) {
  if (!dateStr) return 'Older';
  const d = new Date(dateStr);
  const now = new Date();
  if (isNaN(d.getTime())) return 'Older';

  const dIso = d.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
  const nowIso = now.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });

  if (dIso === nowIso) return 'Today';

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayIso = yesterday.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
  if (dIso === yesterdayIso) return 'Yesterday';

  const diffTime = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return 'Previous 7 days';
  return 'Older';
}

/**
 * Format timestamp into IST 12-hour time string with 'IST' indicator (e.g., '12:30 AM IST')
 * @param {string|Date} dateStr
 * @returns {string}
 */
export function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }) + ' IST';
}

/**
 * Format full date and time in IST (e.g. '12 Nov 2026, 12:30 AM IST')
 * @param {string|Date} dateStr
 * @returns {string}
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    timeZone: IST_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }) + ' IST';
}

/**
 * Format a YYYY-MM-DD date key into a user-friendly IST header (e.g. 'Today · 12 Nov 2026', 'Yesterday · 11 Nov 2026')
 * @param {string} dateStr
 * @returns {string}
 */
export function formatTimelineDateHeader(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const todayIso = now.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayIso = yesterday.toLocaleDateString('en-CA', { timeZone: IST_TIMEZONE });

  const parts = dateStr.slice(0, 10).split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return dateStr;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  const niceDate = d.toLocaleDateString('en-IN', { timeZone: IST_TIMEZONE, day: 'numeric', month: 'short', year: 'numeric' });

  if (dateStr.slice(0, 10) === todayIso) {
    return `Today · ${niceDate}`;
  }
  if (dateStr.slice(0, 10) === yesterdayIso) {
    return `Yesterday · ${niceDate}`;
  }
  const weekday = d.toLocaleDateString('en-IN', { timeZone: IST_TIMEZONE, weekday: 'short' });
  return `${weekday}, ${niceDate}`;
}
