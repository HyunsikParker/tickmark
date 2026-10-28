import Resolver from '@forge/resolver';
import { controlsAndRequests, requestsFor, getControl, setControl, createRequests as createRequestsBulk, attachText, transitionToDone, requestType, request, siteUrl, myself, CONTROL } from './jira.js';
import { quarterOverview, periodStatus, toRequest, headline, defaultQuarter, tracked } from './core/evidence.js';
import { periodOf, shiftPeriod, periodLabel, dueDate, frequencyOf, FREQUENCIES, DEFAULT_GRACE } from './core/periods.js';
import { samplePlan, sampleQuarter, SAMPLE_LABEL } from './core/sample.js';

const resolver = new Resolver();
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const QUARTER = /^(\d{4})-?Q([1-4])$|^Q([1-4])\s*(\d{4})$/i;

export function parseQuarter(text) {
  const m = String(text || '').trim().match(QUARTER);
  if (!m) return null;
  return m[1] ? `${m[1]}-Q${m[2]}` : `${m[4]}-Q${m[3]}`;
}

async function overview(projectKey, quarterText) {
  const now = Date.now();
  const { controls, requests } = await controlsAndRequests(projectKey);
  const quarter = parseQuarter(quarterText) || defaultQuarter(controls, now);
  return { now, controls, requests, quarter, o: quarterOverview(controls, requests, quarter, now) };
}

const quarters = (now) => { const q = periodOf('quarterly', now); return [shiftPeriod(q, 1), q, shiftPeriod(q, -1), shiftPeriod(q, -2), shiftPeriod(q, -3)]; };

async function createRequests(items, controls, projectKey, failed = []) {
  const byKey = new Map(controls.map((c) => [c.key, c]));
  const specs = items.filter((it) => byKey.has(it.key)).map((it) => {
    const control = byKey.get(it.key);
    return { control, period: it.period, periodLabel: periodLabel(it.period), due: ymd(dueDate(it.period, control.setup.graceDays)), projectKey: control.project || projectKey };
  });
  return createRequestsBulk(specs, failed);
}

resolver.define('getOverview', async ({ payload, context }) => {
  const projectKey = context.extension.project.key;
  const [{ now, o, controls }, site] = await Promise.all([overview(projectKey, payload?.quarter), siteUrl()]);
  return { ...o, headline: controls.length ? headline(o) : null, controls: controls.length, quarters: quarters(now).map((q) => ({ value: q, label: periodLabel(q) })), site, open: toRequest(o).length };
});

resolver.define('requestAllOpen', async ({ payload, context }) => {
  const projectKey = context.extension.project.key;
  try {
    const { o, controls } = await overview(projectKey, payload?.quarter);
    const failed = [];
    const created = await createRequests(toRequest(o), controls, projectKey, failed);
    if (!created.length && failed.length) return { ok: false, error: failed[0].error };
    return { ok: true, created, failed: failed.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

const PANEL_PERIODS = { monthly: 6, quarterly: 4, annual: 2 };

async function controlView(key) {
  const now = Date.now();
  const control = await getControl(key);
  if (!control.setup?.frequency) return { key, control: null, frequencies: FREQUENCIES, defaults: DEFAULT_GRACE };
  const requests = await requestsFor([key]);
  const latest = periodOf(control.setup.frequency, now);
  const ids = Array.from({ length: PANEL_PERIODS[control.setup.frequency] }, (_, k) => shiftPeriod(latest, -k)).filter((p) => tracked(control.setup, p));
  const setup = { ...control.setup, sinceLabel: control.setup.since ? periodLabel(control.setup.since) : null };
  return { key, control: { ...control, setup }, periods: ids.map((p) => periodStatus(control, p, requests, now)), frequencies: FREQUENCIES, defaults: DEFAULT_GRACE, site: await siteUrl() };
}

resolver.define('getControl', async ({ context }) => controlView(context.extension.issue.key));

resolver.define('saveSetup', async ({ payload, context }) => {
  const key = context.extension.issue.key;
  const s = payload?.setup || {};
  if (!FREQUENCIES.includes(s.frequency)) return { ok: false, error: 'Choose how often the control runs.' };
  const grace = s.graceDays === '' || s.graceDays == null ? DEFAULT_GRACE[s.frequency] : Number(s.graceDays);
  if (!Number.isInteger(grace) || grace < 0 || grace > 120) return { ok: false, error: 'Days to provide evidence must be a whole number from 0 to 120.' };
  const since = String(s.since || '').trim() ? (parseQuarter(s.since) || String(s.since).trim()) : shiftPeriod(periodOf(s.frequency, Date.now()), -1);
  let sinceOk = false;
  try { sinceOk = frequencyOf(since) === s.frequency; } catch { sinceOk = false; }
  if (!sinceOk) return { ok: false, error: `First period to track must be a ${s.frequency === 'monthly' ? 'month like 2026-09' : s.frequency === 'quarterly' ? 'quarter like 2026-Q3' : 'year like 2026'}.` };
  const setup = { controlId: String(s.controlId || '').trim().slice(0, 20) || null, frequency: s.frequency, graceDays: grace, keyControl: !!s.keyControl, evidence: String(s.evidence || '').trim().slice(0, 500) || null, since };
  await setControl(key, setup);
  return { ok: true, view: await controlView(key) };
});

resolver.define('requestOne', async ({ payload, context }) => {
  const key = context.extension.issue.key;
  const control = await getControl(key);
  if (!control.setup?.frequency) return { ok: false, error: 'This work item is not set up as a control.' };
  const existing = (await requestsFor([key])).find((r) => r.period === payload.period);
  if (existing) return { ok: true, created: null, existing: existing.key, view: await controlView(key) };
  const [created] = await createRequests([{ key, period: payload.period }], [control], control.project);
  return { ok: true, created: created.key, view: await controlView(key) };
});

const doc = (t) => ({ type: 'doc', version: 1, content: t.map((x) => ({ type: 'paragraph', content: [{ type: 'text', text: x }] })) });

resolver.define('loadSample', async ({ context }) => {
  const projectKey = context.extension.project.key;
  const now = Date.now();
  try {
    const existing = await request('POST', '/rest/api/3/search/jql', { jql: `project = "${projectKey}" AND labels = "${SAMPLE_LABEL}"`, fields: ['summary'], maxResults: 1 });
    if (existing?.issues?.length) return { ok: false, error: `This project already has the sample controls (for example ${existing.issues[0].key}).` };
    const [type, me] = await Promise.all([requestType(projectKey), myself()]);
    if (!type) return { ok: false, error: `No work type in ${projectKey} can be created.` };
    const plan = samplePlan(now);
    // All eight controls in one bulk create, each with its setup property; without labels and assignee if refused.
    const make = (c, lean) => ({ fields: { project: { key: projectKey }, issuetype: { id: type.id }, summary: `${c.id} ${c.name}`,
      description: doc([`Sample control created by Tickmark for a fictional company. Evidence: ${c.evidence}`]),
      ...(lean ? {} : { labels: [SAMPLE_LABEL], assignee: { accountId: me.accountId } }) }, properties: [{ key: CONTROL, value: c.setup }] });
    let bulk = await request('POST', '/rest/api/3/issue/bulk', { issueUpdates: plan.map((c) => make(c, false)) }).catch(() => null);
    if (!bulk?.issues?.length || bulk.issues.length < plan.length) bulk = await request('POST', '/rest/api/3/issue/bulk', { issueUpdates: plan.map((c) => make(c, true)) });
    const keys = bulk.issues.map((i) => i.key);
    const controls = plan.map((c, i) => ({ key: keys[i], summary: `${c.id} ${c.name}`, owner: { accountId: me.accountId }, setup: c.setup, project: projectKey }));
    await Promise.all(plan.flatMap((c, i) => c.controlFiles.map((f) => attachText(keys[i], f, c.files[f]))));
    const asks = plan.flatMap((c, i) => c.requests.map((r) => ({ c, i, r })));
    const made = await createRequests(asks.map(({ i, r }) => ({ key: keys[i], period: r.period })), controls, projectKey);
    const byAsk = (a) => made.find((m) => m.control === keys[a.i] && m.period === a.r.period);
    await Promise.all(asks.flatMap((a) => (byAsk(a) ? a.r.files.map((f) => attachText(byAsk(a).key, f, a.c.files[f])) : [])));
    await Promise.all(asks.filter((a) => a.r.done && byAsk(a)).map((a) => transitionToDone(byAsk(a).key)));
    return { ok: true, keys, quarter: sampleQuarter(now) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

export const handler = resolver.getDefinitions();

// Rovo actions. Inputs come from the agent; issue and project keys are validated by their shape before use.
const KEY = /^[A-Z][A-Z0-9_]+-\d+$/;
const PROJECT = /^[A-Z][A-Z0-9_]+$/;

function compact(o) {
  return { quarter: o.label, headline: headline(o), controls: o.rows.map((r) => ({ key: r.key, control: r.controlId, summary: r.summary, owner: r.owner?.displayName || 'unassigned', keyControl: r.keyControl, state: r.state,
    periods: r.periods.map((p) => ({ period: p.label, periodId: p.period, state: p.state, detail: p.text, request: p.request?.key || null, files: p.evidence.map((e) => e.file) })) })) };
}

export async function evidenceStatus(payload) {
  const projectKey = String(payload?.projectKey || '').trim().toUpperCase();
  if (!PROJECT.test(projectKey)) return { error: 'Give the Jira project key, for example CTRL.' };
  const { o, controls } = await overview(projectKey, payload?.quarter);
  if (!controls.length) return { error: `No work item in ${projectKey} is set up as a control.` };
  return compact(o);
}

export async function controlEvidence(payload) {
  const key = String(payload?.issueKey || '').trim().toUpperCase();
  if (!KEY.test(key)) return { error: 'Give the key of the control work item, for example CTRL-12.' };
  const v = await controlView(key);
  if (!v.control) return { error: `${key} is not set up as a control.` };
  return { key, control: v.control.setup.controlId, summary: v.control.summary, owner: v.control.owner?.displayName || 'unassigned', frequency: v.control.setup.frequency,
    evidenceNeeded: v.control.setup.evidence, periods: v.periods.map((p) => ({ period: p.label, periodId: p.period, state: p.state, detail: p.text, request: p.request?.key || null, files: p.evidence.map((e) => `${e.file} (${ymd(e.at)})`) })) };
}

export async function requestEvidence(payload) {
  const key = String(payload?.issueKey || '').trim().toUpperCase();
  const period = String(payload?.period || '').trim();
  if (!KEY.test(key)) return { error: 'Give the key of the control work item, for example CTRL-12.' };
  const control = await getControl(key);
  if (!control.setup?.frequency) return { error: `${key} is not set up as a control.` };
  const p = parseQuarter(period) || (/^\d{4}(-\d{2})?$/.test(period) ? period : null);
  if (!p) return { error: 'Give the period as 2026-09, 2026-Q3 (or Q3 2026) or 2026.' };
  if (frequencyOf(p) !== control.setup.frequency) return { error: `${key} runs ${control.setup.frequency}; give a period of that length.` };
  const existing = (await requestsFor([key])).find((r) => r.period === p);
  if (existing) return { ok: true, existing: existing.key, message: `Evidence for ${periodLabel(p)} was already requested in ${existing.key}.` };
  const [created] = await createRequests([{ key, period: p }], [control], control.project);
  return { ok: true, created: created.key, message: `Requested the evidence for ${periodLabel(p)} in ${created.key}, assigned to ${control.owner?.displayName || 'nobody (the control has no owner)'}.` };
}
