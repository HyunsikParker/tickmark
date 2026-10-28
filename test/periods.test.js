import test from 'node:test';
import assert from 'node:assert/strict';
import { periodOf, periodRange, shiftPeriod, periodLabel, dueDate, periodsInQuarter, collectingQuarter, periodsInName } from '../src/core/periods.js';

const at = (s) => Date.parse(s);

test('periods of each frequency and their ranges', () => {
  assert.equal(periodOf('monthly', at('2026-09-15T12:00:00Z')), '2026-09');
  assert.equal(periodOf('quarterly', at('2026-09-15T12:00:00Z')), '2026-Q3');
  assert.equal(periodOf('annual', at('2026-09-15T12:00:00Z')), '2026');
  assert.equal(new Date(periodRange('2026-Q3').start).toISOString(), '2026-07-01T00:00:00.000Z');
  assert.equal(new Date(periodRange('2026-Q3').end).toISOString(), '2026-09-30T23:59:59.999Z');
  assert.equal(new Date(periodRange('2026-02').end).toISOString(), '2026-02-28T23:59:59.999Z');
});

test('shifting and labels', () => {
  assert.equal(shiftPeriod('2026-Q1', -1), '2025-Q4');
  assert.equal(shiftPeriod('2026-12', 1), '2027-01');
  assert.equal(shiftPeriod('2026', -1), '2025');
  assert.equal(periodLabel('2026-09'), 'September 2026');
  assert.equal(periodLabel('2026-Q3'), 'Q3 2026');
});

test('evidence is due a number of days after the period ends', () => {
  assert.equal(new Date(dueDate('2026-Q3', 30)).toISOString(), '2026-10-30T23:59:59.999Z');
  assert.equal(new Date(dueDate('2026-09', 10)).toISOString(), '2026-10-10T23:59:59.999Z');
  assert.equal(new Date(dueDate('2026-Q3')).toISOString(), '2026-10-30T23:59:59.999Z');
});

test('the periods of a control inside a quarter', () => {
  assert.deepEqual(periodsInQuarter('monthly', '2026-Q3'), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(periodsInQuarter('monthly', '2026-Q4'), ['2026-10', '2026-11', '2026-12']);
  assert.deepEqual(periodsInQuarter('quarterly', '2026-Q3'), ['2026-Q3']);
  assert.deepEqual(periodsInQuarter('annual', '2026-Q4'), ['2026']);
  assert.deepEqual(periodsInQuarter('annual', '2026-Q3'), []);
});

test('the quarter being collected is the last one until its quarterly evidence is due', () => {
  assert.equal(collectingQuarter(at('2026-10-28T12:00:00Z')), '2026-Q3');
  assert.equal(collectingQuarter(at('2026-11-05T12:00:00Z')), '2026-Q4');
});

test('period tokens in evidence file names', () => {
  assert.deepEqual(periodsInName('UAR_Q3_2026_signed.xlsx', 'quarterly'), ['2026-Q3']);
  assert.deepEqual(periodsInName('restore-test 2026Q3.pdf', 'quarterly'), ['2026-Q3']);
  assert.deepEqual(periodsInName('bank-rec-2026-09.pdf', 'monthly'), ['2026-09']);
  assert.deepEqual(periodsInName('Sep 2026 JE review.xlsx', 'monthly'), ['2026-09']);
  assert.deepEqual(periodsInName('September_2026_privileged_access.csv', 'monthly'), ['2026-09']);
  assert.deepEqual(periodsInName('FY2026 code of conduct attestations.pdf', 'annual'), ['2026']);
  assert.deepEqual(periodsInName('notes.txt', 'monthly'), []);
});
