import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPaise, fromPaise, formatINR } from './money';

test('toPaise converts rupees to integer paise', () => {
  assert.equal(toPaise(100), 10000);
  assert.equal(toPaise(1499.5), 149950);
  assert.equal(toPaise(0), 0);
});

test('toPaise rounds float artifacts to the nearest paisa', () => {
  assert.equal(toPaise(19.99), 1999);
  assert.equal(toPaise(0.1 + 0.2), 30); // 0.30000000000000004 -> 30
});

test('fromPaise converts paise back to rupees', () => {
  assert.equal(fromPaise(10000), 100);
  assert.equal(fromPaise(149950), 1499.5);
});

test('toPaise rejects non-finite input', () => {
  assert.throws(() => toPaise(Number.NaN));
  assert.throws(() => toPaise(-5));
});

test('formatINR renders Indian grouping', () => {
  assert.equal(formatINR(150000), '₹1,50,000');
});
