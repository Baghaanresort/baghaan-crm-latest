import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReferenceId, parseReferenceId, computeAdvance, nextLinkVersion } from './transaction-helpers';

test('buildReferenceId is stable and parseable', () => {
  assert.equal(buildReferenceId('BK-1', 'advance', 1), 'BK-1:advance:v1');
  const p = parseReferenceId('BK-1:advance:v1');
  assert.deepEqual(p, { bookingId: 'BK-1', purpose: 'advance', version: 1 });
});

test('parseReferenceId rejects junk', () => {
  assert.equal(parseReferenceId('garbage'), null);
});

test('computeAdvance rounds to whole rupees', () => {
  assert.equal(computeAdvance(10000, 50), 5000);
  assert.equal(computeAdvance(9999, 50), 5000);  // 4999.5 -> 5000
  assert.equal(computeAdvance(10000, 100), 10000);
});

test('computeAdvance clamps pct to 1..100 and total >= 0', () => {
  assert.throws(() => computeAdvance(-1, 50));
  assert.equal(computeAdvance(10000, 0), 10000);   // 0 -> treat as full
  assert.equal(computeAdvance(10000, 150), 10000); // >100 -> full
});

test('nextLinkVersion bumps past the highest existing version for that purpose', () => {
  const refs = ['BK-1:advance:v1', 'BK-1:advance:v2', 'BK-1:balance:v1'];
  assert.equal(nextLinkVersion(refs, 'BK-1', 'advance'), 3);
  assert.equal(nextLinkVersion(refs, 'BK-1', 'balance'), 2);
  assert.equal(nextLinkVersion([], 'BK-9', 'advance'), 1);
});
