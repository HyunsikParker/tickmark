// Control periods: months, quarters and years, in UTC calendar dates. A period id is '2026-09', '2026-Q3' or '2026'.

const DAY = 86400000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

export const FREQUENCIES = ['monthly', 'quarterly', 'annual'];
export const DEFAULT_GRACE = { monthly: 10, quarterly: 30, annual: 45 };

const utc = (y, m, d = 1) => Date.UTC(y, m, d);

export function frequencyOf(id) {
  if (/^\d{4}-\d{2}$/.test(id)) return 'monthly';
  if (/^\d{4}-Q[1-4]$/.test(id)) return 'quarterly';
  if (/^\d{4}$/.test(id)) return 'annual';
  throw new Error(`Not a period: ${id}`);
}

// The period of a frequency that contains a moment.
export function periodOf(frequency, ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (frequency === 'monthly') return `${y}-${String(m + 1).padStart(2, '0')}`;
  if (frequency === 'quarterly') return `${y}-Q${Math.floor(m / 3) + 1}`;
  if (frequency === 'annual') return `${y}`;
  throw new Error(`Unknown frequency: ${frequency}`);
}

// First and last millisecond of a period.
export function periodRange(id) {
  const f = frequencyOf(id);
  const y = Number(id.slice(0, 4));
  if (f === 'monthly') {
    const m = Number(id.slice(5)) - 1;
    return { start: utc(y, m), end: utc(y, m + 1) - 1 };
  }
  if (f === 'quarterly') {
    const q = Number(id.slice(6)) - 1;
    return { start: utc(y, q * 3), end: utc(y, q * 3 + 3) - 1 };
  }
  return { start: utc(y, 0), end: utc(y + 1, 0) - 1 };
}

export function shiftPeriod(id, n) {
  const f = frequencyOf(id);
  const { start } = periodRange(id);
  const d = new Date(start);
  if (f === 'monthly') return periodOf(f, utc(d.getUTCFullYear(), d.getUTCMonth() + n));
  if (f === 'quarterly') return periodOf(f, utc(d.getUTCFullYear(), d.getUTCMonth() + 3 * n));
  return periodOf(f, utc(d.getUTCFullYear() + n, 0));
}

export function periodLabel(id) {
  const f = frequencyOf(id);
  if (f === 'monthly') return `${MONTHS[Number(id.slice(5)) - 1]} ${id.slice(0, 4)}`;
  if (f === 'quarterly') return `${id.slice(5)} ${id.slice(0, 4)}`;
  return id;
}

// Evidence for a period is due a number of days after the period ends.
export function dueDate(id, graceDays) {
  const g = Number.isFinite(Number(graceDays)) ? Number(graceDays) : DEFAULT_GRACE[frequencyOf(id)];
  return periodRange(id).end + 1 + g * DAY - 1;
}

// The periods of a control that end inside a quarter: three months, one quarter, or the year when the quarter is Q4.
export function periodsInQuarter(frequency, quarter) {
  const q = periodRange(quarter);
  if (frequency === 'quarterly') return [quarter];
  if (frequency === 'monthly') {
    const d = new Date(q.start);
    return [0, 1, 2].map((k) => periodOf('monthly', utc(d.getUTCFullYear(), d.getUTCMonth() + k)));
  }
  const year = periodOf('annual', q.start);
  return periodRange(year).end === q.end ? [year] : [];
}

// The quarter whose evidence a team is most likely collecting: the last completed quarter while its evidence for
// quarterly controls can still be due, otherwise the current one.
export function collectingQuarter(now, graceDays = DEFAULT_GRACE.quarterly) {
  const current = periodOf('quarterly', now);
  const previous = shiftPeriod(current, -1);
  return now <= dueDate(previous, graceDays) ? previous : current;
}

// Period tokens in a file name, for evidence attached to the control itself: 2026-09, 202609, Sep 2026,
// September 2026, Q3 2026, 2026 Q3, 2026Q3, FY2026.
export function periodsInName(name, frequency) {
  const s = String(name || '');
  const found = new Set();
  const year = '(20\\d{2})';
  if (frequency === 'monthly') {
    for (const m of s.matchAll(new RegExp(`${year}[-_. ]?(0[1-9]|1[0-2])(?!\\d)`, 'g'))) found.add(`${m[1]}-${m[2]}`);
    for (const m of s.matchAll(new RegExp(`(?<![A-Za-z])(${SHORT.join('|')})[a-z]*[-_. ]?${year}`, 'gi'))) {
      const k = SHORT.findIndex((x) => x.toLowerCase() === m[1].slice(0, 3).toLowerCase());
      found.add(`${m[2]}-${String(k + 1).padStart(2, '0')}`);
    }
  }
  if (frequency === 'quarterly') {
    for (const m of s.matchAll(new RegExp(`(?<![A-Za-z0-9])Q([1-4])[-_. ]?${year}`, 'gi'))) found.add(`${m[2]}-Q${m[1]}`);
    for (const m of s.matchAll(new RegExp(`${year}[-_. ]?Q([1-4])(?![0-9])`, 'gi'))) found.add(`${m[1]}-Q${m[2]}`);
  }
  if (frequency === 'annual') {
    for (const m of s.matchAll(new RegExp(`(?<![A-Za-z])FY[-_. ]?${year}`, 'gi'))) found.add(m[1]);
  }
  return [...found];
}

export const daysBetween = (a, b) => Math.round((b - a) / DAY);
