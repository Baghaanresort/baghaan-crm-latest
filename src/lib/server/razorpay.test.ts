import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from './razorpay';

const secret = 'whsec_test';
const body = JSON.stringify({ event: 'payment_link.paid', x: 1 });
const goodSig = createHmac('sha256', secret).update(body).digest('hex');

test('accepts a correct signature', () => {
  assert.equal(verifyWebhookSignature(body, goodSig, secret), true);
});

test('rejects a tampered body', () => {
  assert.equal(verifyWebhookSignature(body + ' ', goodSig, secret), false);
});

test('rejects a wrong signature without throwing', () => {
  assert.equal(verifyWebhookSignature(body, 'deadbeef', secret), false);
});

test('rejects empty signature', () => {
  assert.equal(verifyWebhookSignature(body, '', secret), false);
});
