// Sample controls for a fictional company, timed relative to now so the last completed quarter shows every state:
// reviewed, in, requested, overdue and late. Evidence files uploaded now are on time only for periods still due,
// so grace days are set from today's date.
import { periodOf, periodRange, periodsInQuarter, shiftPeriod, periodLabel } from './periods.js';

export const SAMPLE_LABEL = 'tickmark-sample';
const DAY = 86400000;

const CONTROLS = [
  { id: 'ITGC-01', name: 'Quarterly user access review: ERP', frequency: 'quarterly', key: true, evidence: 'Signed user access listing from the ERP with the reviewer\'s approvals and the removals made.', plan: 'reviewed' },
  { id: 'ITGC-02', name: 'Change management: sample of approved changes', frequency: 'quarterly', key: true, evidence: 'List of production changes in the quarter and the approval record for a sample of 25.', plan: 'in' },
  { id: 'ITGC-03', name: 'Backup restore test', frequency: 'quarterly', key: false, evidence: 'Restore test log and the sign-off of the infrastructure lead.', plan: 'requested' },
  { id: 'FIN-03', name: 'Revenue cut-off testing', frequency: 'quarterly', key: true, evidence: 'Cut-off test workpaper for the last five and first five business days around quarter end.', plan: 'overdue' },
  { id: 'ITGC-04', name: 'Privileged access log review', frequency: 'monthly', key: false, evidence: 'Export of privileged sessions for the month with the reviewer\'s notes.', plan: 'late' },
  { id: 'FIN-01', name: 'Bank reconciliation', frequency: 'monthly', key: true, evidence: 'Signed reconciliation for each operating account, with reconciling items explained.', plan: 'mixed' },
  { id: 'FIN-02', name: 'Manual journal entries over 50,000: review', frequency: 'monthly', key: true, evidence: 'Report of manual journal entries above the threshold with the reviewer\'s sign-off.', plan: 'overdue' },
  { id: 'ELC-01', name: 'Code of conduct attestation', frequency: 'annual', key: false, evidence: 'Attestation completion report from the HR system.', plan: 'not-requested' },
];

const csv = (id, period) => `control,period,prepared_by,note\n${id},${period},Sample preparer,Fictional sample evidence created by Tickmark\n`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// What to create: the controls (with grace days that put due dates a few days before or after now), the request
// work items, the files and which requests to close as reviewed.
export function samplePlan(now) {
  const quarter = shiftPeriod(periodOf('quarterly', now), -1);
  const end = periodRange(quarter).end;
  const since = Math.floor((now - end) / DAY); // whole days since the quarter ended
  const dueIn = since + 3; // grace that puts the due date three days ahead
  const pastDue = Math.max(0, since - 4); // grace that put the due date four days back (or as far back as possible)
  return CONTROLS.map((c) => {
    const periods = periodsInQuarter(c.frequency, quarter);
    const graceDays = ['overdue'].includes(c.plan) ? pastDue : dueIn;
    const last = periods[periods.length - 1];
    const requests = [];
    const controlFiles = [];
    if (c.plan === 'reviewed') requests.push({ period: last, files: [`UAR_${quarter.replace('-', '_')}_ERP_signed.csv`], done: true });
    if (c.plan === 'in') requests.push({ period: last, files: [`Change_sample_${quarter}.csv`], done: false });
    if (c.plan === 'requested') requests.push({ period: last, files: [], done: false });
    if (c.plan === 'late') {
      for (const p of periods.slice(0, -1)) controlFiles.push(`privileged_access_${p}.csv`);
      requests.push({ period: last, files: [], done: false });
    }
    if (c.plan === 'mixed') {
      for (const p of periods) controlFiles.push(`bank-rec-${p}.csv`);
    }
    const since = periods[0] || periodOf(c.frequency, periodRange(quarter).start);
    return { ...c, quarter, periods, setup: { controlId: c.id, frequency: c.frequency, graceDays, keyControl: c.key, evidence: c.evidence, since }, requests, controlFiles,
      files: Object.fromEntries([...requests.flatMap((r) => r.files), ...controlFiles].map((f) => [f, csv(c.id, f)])) };
  });
}

export const sampleQuarter = (now) => shiftPeriod(periodOf('quarterly', now), -1);
export const sampleSummary = (now) => `Sample controls for a fictional company, timed so that ${periodLabel(sampleQuarter(now))} shows evidence reviewed, in, requested, late and overdue.`;
export { slug };
