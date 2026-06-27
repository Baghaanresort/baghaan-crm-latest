import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharingGuests, totalGuests, totalRooms } from './occupancy';

// The Horiba India cost sheet from the bug report: 3 single rooms + 14 double
// rooms → 31 guests, 17 rooms (printed sheet wrongly showed 17 pax / 0 rooms).
const horiba = { single: 3, double: 14, triple: 0 };

test('sharingGuests derives pax per basis from room counts', () => {
  assert.deepEqual(sharingGuests(horiba), { single: 3, double: 28, triple: 0 });
});

test('totalGuests sums heads, not rooms', () => {
  assert.equal(totalGuests(horiba), 31);
});

test('totalRooms sums rooms across bases', () => {
  assert.equal(totalRooms(horiba), 17);
});

test('triple sharing counts three to a room', () => {
  assert.equal(totalGuests({ single: 0, double: 0, triple: 4 }), 12);
  assert.equal(totalRooms({ single: 0, double: 0, triple: 4 }), 4);
});

test('null / undefined guest count is treated as empty', () => {
  assert.equal(totalGuests(null), 0);
  assert.equal(totalRooms(undefined), 0);
  assert.deepEqual(sharingGuests(null), { single: 0, double: 0, triple: 0 });
});
