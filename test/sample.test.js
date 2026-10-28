import test from 'node:test';
import assert from 'node:assert/strict';
import { samplePlan } from '../src/core/sample.js';
import { quarterOverview, defaultQuarter } from '../src/core/evidence.js';

// What Jira would hold right after the sample loads: every file and request created now.
function simulate(now) {
  const iso = new Date(now).toISOString();
  const plan = samplePlan(now);
  const controls = plan.map((c, i) => ({ key: `CTRL-${i + 1}`, summary: `${c.id} ${c.name}`, owner: { accountId: 'me', displayName: 'Me' }, setup: c.setup,
    attachments: c.controlFiles.map((f) => ({ id: f, filename: f, created: iso, author: 'Me' })) }));
  let n = 100;
  const requests = plan.flatMap((c, i) => c.requests.map((r) => ({ key: `CTRL-${n++}`, control: `CTRL-${i + 1}`, period: r.period, created: iso, status: r.done ? 'Done' : 'To Do', statusCategory: r.done ? 'done' : 'new',
    attachments: r.files.map((f) => ({ id: f, filename: f, created: iso, author: 'Me' })) })));
  return { plan, controls, requests };
}

for (const when of ['2026-10-28T12:00:00Z', '2027-01-05T09:00:00Z', '2026-12-28T09:00:00Z']) {
  test(`the sample shows every state in the last completed quarter (loaded ${when})`, () => {
    const now = Date.parse(when);
    const { plan, controls, requests } = simulate(now);
    const o = quarterOverview(controls, requests, plan[0].quarter, now);
    const byId = Object.fromEntries(o.rows.map((r) => [r.controlId, r.state]));
    assert.equal(byId['ITGC-01'], 'reviewed');
    assert.equal(byId['ITGC-02'], 'in');
    assert.equal(byId['ITGC-03'], 'requested');
    assert.equal(byId['FIN-03'], 'overdue');
    assert.equal(byId['ITGC-04'], 'late');
    assert.equal(byId['FIN-01'], 'late');
    assert.equal(byId['FIN-02'], 'overdue');
    assert.equal(defaultQuarter(controls, now), plan[0].quarter);
  });
}

test('sample files carry the period in their names', () => {
  const plan = samplePlan(Date.parse('2026-10-28T12:00:00Z'));
  const fin01 = plan.find((c) => c.id === 'FIN-01');
  assert.deepEqual(fin01.controlFiles, ['bank-rec-2026-07.csv', 'bank-rec-2026-08.csv', 'bank-rec-2026-09.csv']);
  assert.equal(plan.find((c) => c.id === 'ELC-01').periods.length, 0);
});
