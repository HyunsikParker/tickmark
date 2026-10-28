import test from 'node:test';
import assert from 'node:assert/strict';
import { periodStatus, quarterOverview, toRequest, headline } from '../src/core/evidence.js';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const control = (key, frequency, extra = {}) => ({ key, summary: `${key} control`, owner: { accountId: 'a1', displayName: 'Owner' }, attachments: [], setup: { controlId: key, frequency, graceDays: frequency === 'monthly' ? 10 : 30, ...extra } });
const file = (filename, created) => ({ id: filename, filename, created, author: 'Owner' });
const req = (key, controlKey, period, attachments = [], statusCategory = 'new') => ({ key, control: controlKey, period, attachments, status: statusCategory === 'done' ? 'Done' : 'To Do', statusCategory, created: '2026-10-01T09:00:00Z' });

test('evidence on the request before the due date is in; after it, late', () => {
  const c = control('ITGC-01', 'quarterly');
  const inTime = periodStatus(c, '2026-Q3', [req('CTRL-9', 'ITGC-01', '2026-Q3', [file('uar.xlsx', '2026-10-20T10:00:00Z')])], NOW);
  assert.equal(inTime.state, 'in');
  assert.match(inTime.text, /1 file in, first on 2026-10-20/);
  const m = control('FIN-01', 'monthly');
  const late = periodStatus(m, '2026-09', [req('CTRL-10', 'FIN-01', '2026-09', [file('rec.pdf', '2026-10-14T10:00:00Z')])], NOW);
  assert.equal(late.state, 'late');
  assert.equal(late.lateBy, 3);
});

test('a done request with evidence is reviewed', () => {
  const c = control('ITGC-02', 'quarterly');
  const s = periodStatus(c, '2026-Q3', [req('CTRL-11', 'ITGC-02', '2026-Q3', [file('changes.csv', '2026-10-05T10:00:00Z')], 'done')], NOW);
  assert.equal(s.state, 'reviewed');
});

test('a file on the control counts when its name carries the period', () => {
  const c = { ...control('FIN-02', 'monthly'), attachments: [file('JE review Sep 2026.xlsx', '2026-10-08T10:00:00Z'), file('JE review Aug 2026.xlsx', '2026-09-07T10:00:00Z')] };
  const s = periodStatus(c, '2026-09', [], NOW);
  assert.equal(s.state, 'in');
  assert.equal(s.evidence.length, 1);
  assert.equal(s.evidence[0].source, 'control');
});

test('no evidence: requested or not yet before the due date, overdue after it, upcoming while the period runs', () => {
  const q = control('ITGC-03', 'quarterly');
  assert.equal(periodStatus(q, '2026-Q3', [req('CTRL-12', 'ITGC-03', '2026-Q3')], NOW).state, 'requested');
  const open = periodStatus(q, '2026-Q3', [], NOW);
  assert.equal(open.state, 'not-requested');
  assert.equal(open.daysLeft, 3);
  const m = control('ITGC-04', 'monthly');
  const over = periodStatus(m, '2026-09', [], NOW);
  assert.equal(over.state, 'overdue');
  assert.equal(over.daysOverdue, 17);
  assert.match(over.text, /never requested/);
  assert.equal(periodStatus(m, '2026-10', [], NOW).state, 'upcoming');
});

test('the quarter overview puts the worst control first and counts the periods', () => {
  const controls = [control('ITGC-01', 'quarterly'), control('ITGC-04', 'monthly'), control('ELC-01', 'annual')];
  const requests = [req('CTRL-9', 'ITGC-01', '2026-Q3', [file('uar.xlsx', '2026-10-20T10:00:00Z')]),
    req('CTRL-13', 'ITGC-04', '2026-07', [file('log-2026-07.csv', '2026-08-05T10:00:00Z')], 'done'),
    req('CTRL-14', 'ITGC-04', '2026-08', [file('log-2026-08.csv', '2026-09-04T10:00:00Z')])];
  const o = quarterOverview(controls, requests, '2026-Q3', NOW);
  assert.equal(o.rows[0].key, 'ITGC-04');
  assert.equal(o.rows[0].state, 'overdue');
  assert.equal(o.rows.at(-1).state, 'not-due');
  assert.equal(o.periods, 4);
  assert.equal(o.withEvidence, 3);
  assert.match(headline(o), /^Q3 2026: 3 of 4 due periods have evidence, 1 overdue, 1 reviewed\.$/);
  assert.deepEqual(toRequest(o).map((t) => `${t.key} ${t.period}`), ['ITGC-04 2026-09']);
});
