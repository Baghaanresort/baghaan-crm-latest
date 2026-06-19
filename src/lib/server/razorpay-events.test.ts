import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRazorpayEvent } from './razorpay-events';

test('parses payment_link.paid', () => {
  const ev = {
    event: 'payment_link.paid',
    payload: {
      payment_link: { entity: { id: 'plink_1', reference_id: 'BK-1:advance:v1', amount: 50000, amount_paid: 50000 } },
      payment: { entity: { id: 'pay_1', amount: 50000 } },
    },
  };
  const p = parseRazorpayEvent(ev);
  assert.equal(p.kind, 'payment_link_paid');
  assert.equal(p.linkId, 'plink_1');
  assert.equal(p.referenceId, 'BK-1:advance:v1');
  assert.equal(p.paymentId, 'pay_1');
  assert.equal(p.amountPaise, 50000);
});

test('parses refund.processed', () => {
  const ev = { event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 50000 } } } };
  const p = parseRazorpayEvent(ev);
  assert.equal(p.kind, 'refund_processed');
  assert.equal(p.refundId, 'rfnd_1');
  assert.equal(p.paymentId, 'pay_1');
});

test('ignores unknown events', () => {
  assert.equal(parseRazorpayEvent({ event: 'order.paid', payload: {} }).kind, 'ignored');
  assert.equal(parseRazorpayEvent(null).kind, 'ignored');
});
