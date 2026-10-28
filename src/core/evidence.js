// Evidence status of a control for each of its periods: what came in, when, and what is still missing.
import { daysBetween, dueDate, periodLabel, periodOf, periodRange, periodsInName, periodsInQuarter, shiftPeriod, DEFAULT_GRACE } from './periods.js';

// Worst first: the state that decides a control's line on the quarter overview.
export const STATES = ['overdue', 'late', 'not-requested', 'requested', 'upcoming', 'in', 'reviewed'];
const DONE = new Set(['done']);
const DAY = 86400000;
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);

// Periods before the control's first tracked period are not expected to have evidence.
export const tracked = (setup, period) => !setup?.since || period >= setup.since;
const grace = (setup) => (Number.isFinite(Number(setup?.graceDays)) ? Number(setup.graceDays) : DEFAULT_GRACE[setup?.frequency] ?? 30);

// Evidence for a period: files on its request work item, and files on the control whose name carries the period.
export function evidenceFor(control, period, requests) {
  const req = requests.filter((r) => r.control === control.key && r.period === period);
  const items = [];
  for (const r of req) for (const a of r.attachments || []) items.push({ file: a.filename, at: Date.parse(a.created), by: a.author || null, source: 'request', key: r.key, id: a.id });
  for (const a of control.attachments || []) {
    if (periodsInName(a.filename, control.setup.frequency).includes(period)) items.push({ file: a.filename, at: Date.parse(a.created), by: a.author || null, source: 'control', key: control.key, id: a.id });
  }
  return { items: items.sort((x, y) => x.at - y.at), request: req.sort((a, b) => Date.parse(a.created) - Date.parse(b.created))[0] || null };
}

export function periodStatus(control, period, requests, now) {
  const due = dueDate(period, grace(control.setup));
  const { end } = periodRange(period);
  const { items, request } = evidenceFor(control, period, requests);
  const reviewed = !!request && DONE.has(request.statusCategory);
  const base = { period, label: periodLabel(period), due, evidence: items, request: request ? { key: request.key, status: request.status } : null };
  if (items.length) {
    const first = items[0].at;
    const late = first > due;
    const state = reviewed ? 'reviewed' : late ? 'late' : 'in';
    const lateBy = late ? Math.max(1, daysBetween(due, first)) : 0;
    const text = `${items.length} file${items.length === 1 ? '' : 's'} in, first on ${fmt(first)}${late ? `, ${lateBy} day${lateBy === 1 ? '' : 's'} after the due date` : ''}${reviewed ? '; reviewed' : ''}`;
    return { ...base, state, lateBy, text };
  }
  if (now <= end) return { ...base, state: 'upcoming', text: `Period ends ${fmt(end)}; evidence due ${fmt(due)}` };
  if (now <= due) {
    const left = Math.max(0, Math.ceil((due - now) / DAY));
    return { ...base, state: request ? 'requested' : 'not-requested', daysLeft: left, text: `${request ? `Requested in ${request.key}` : 'Not requested yet'}; due ${fmt(due)}, ${left} day${left === 1 ? '' : 's'} left` };
  }
  const over = Math.max(1, Math.floor((now - due) / DAY));
  return { ...base, state: 'overdue', daysOverdue: over, text: `No evidence; due ${fmt(due)}, ${over} day${over === 1 ? '' : 's'} overdue${request ? ` (requested in ${request.key})` : ' (never requested)'}` };
}

const worst = (states) => STATES.find((s) => states.includes(s)) || null;

// One line per control for a quarter, and the counts for the header.
export function quarterOverview(controls, requests, quarter, now) {
  const rows = controls.map((c) => {
    const all = periodsInQuarter(c.setup.frequency, quarter);
    const periods = all.filter((p) => tracked(c.setup, p)).map((p) => periodStatus(c, p, requests, now));
    return { key: c.key, summary: c.summary, controlId: c.setup.controlId || null, frequency: c.setup.frequency, keyControl: !!c.setup.keyControl,
      owner: c.owner || null, periods, state: periods.length ? worst(periods.map((p) => p.state)) : 'not-due',
      sinceLabel: c.setup.since ? periodLabel(c.setup.since) : null, notTracked: all.length > 0 && periods.length === 0 };
  });
  const all = rows.flatMap((r) => r.periods);
  const count = (s) => all.filter((p) => p.state === s).length;
  const counts = Object.fromEntries(STATES.map((s) => [s, count(s)]));
  const withEvidence = counts.in + counts.late + counts.reviewed;
  const due = all.filter((p) => p.state !== 'upcoming').length;
  rows.sort((a, b) => (STATES.indexOf(a.state) + 99 * (a.state === 'not-due')) - (STATES.indexOf(b.state) + 99 * (b.state === 'not-due')) || String(a.controlId || a.key).localeCompare(String(b.controlId || b.key)));
  return { quarter, label: periodLabel(quarter), rows, counts, periods: all.length, due, withEvidence };
}

// The periods in a quarter that need a request: past their end, no evidence and no request yet.
export function toRequest(overview) {
  return overview.rows.flatMap((r) => r.periods.filter((p) => p.state === 'not-requested' || (p.state === 'overdue' && !p.request)).map((p) => ({ key: r.key, period: p.period, due: p.due, owner: r.owner })));
}

export function headline(o) {
  const parts = [`${o.withEvidence} of ${o.due} due period${o.due === 1 ? '' : 's'} have evidence`];
  if (o.counts.overdue) parts.push(`${o.counts.overdue} overdue`);
  if (o.counts.late) parts.push(`${o.counts.late} came in late`);
  if (o.counts.requested + o.counts['not-requested']) parts.push(`${o.counts.requested + o.counts['not-requested']} still open`);
  if (o.counts.reviewed) parts.push(`${o.counts.reviewed} reviewed`);
  return `${o.label}: ${parts.join(', ')}.`;
}

// The quarter to open with: the last one while any of its evidence fell due in the past week or is still to come,
// otherwise the current one.
export function defaultQuarter(controls, now) {
  const current = periodOf('quarterly', now);
  const previous = shiftPeriod(current, -1);
  const recent = controls.some((c) => periodsInQuarter(c.setup.frequency, previous).some((p) => tracked(c.setup, p) && dueDate(p, grace(c.setup)) >= now - 7 * DAY));
  return recent ? previous : current;
}
