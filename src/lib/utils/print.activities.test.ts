import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCostSheetHTML, buildPIHTML } from './print';
import { INCLUDED_ACTIVITIES, PAID_ACTIVITIES } from '@/lib/constants/activities';
import { BILLING_ENTITIES } from '@/lib/constants/billing';
import type { Booking, ProformaInvoice } from '@/lib/types/booking';

// Minimal booking with only the fields the document builders read.
const booking = {
  companyName: 'Acme Corp',
  companyAddress: 'Noida',
  contactName: 'Test',
  contactNumber: '99999',
  companyGST: '',
  arrival: '2026-07-01',
  departure: '2026-07-02',
  nights: 1,
  rooms: ['101'],
  guestCount: { single: 0, double: 2, triple: 0 },
  costSheet: { version: 1 },
} as unknown as Booking;

const pi = {
  piNumber: 'PI-TEST-001',
  generatedAt: '2026-06-27',
  generatedBy: 'Tester',
  lineItems: [],
  grandTotal: 10000,
  advanceRequired: 5000,
  paymentTerms: '',
  billingEntity: 'baghaan',
} as unknown as ProformaInvoice;

test('Cost Sheet HTML renders the paid-activities rate card with rates', () => {
  const html = buildCostSheetHTML({
    booking,
    items: [],
    grandTotal: 0,
    byDay: {},
    notes: '',
    inclusions: [...INCLUDED_ACTIVITIES],
    terms: 'GST as applicable.',
  });
  assert.ok(html.includes('Paid Activities'), 'paid-activities heading present');
  for (const a of PAID_ACTIVITIES) {
    assert.ok(html.includes(a.name), `paid activity "${a.name}" present`);
    assert.ok(html.includes(a.rate.toLocaleString('en-IN')), `rate for "${a.name}" present`);
  }
  // Free activities flow through the inclusions arg on the cost sheet.
  assert.ok(html.includes('Volleyball'), 'free activity present in inclusions');
  // guestCount holds ROOM counts: 2 double rooms → 4 pax / 2 rooms.
  assert.ok(html.includes('Total Guests</div>4 pax'), 'total guests derived from rooms (4 pax)');
  assert.ok(html.includes('Double Share</div>2 rooms · 4 pax'), 'double share shows rooms and derived pax');
});

test('Proforma Invoice HTML renders both free list and paid rate card', () => {
  const entity = BILLING_ENTITIES.baghaan!;
  const html = buildPIHTML(booking, pi, entity);
  assert.ok(html.includes('Activities Included'), 'free-activities heading present');
  assert.ok(html.includes('Paid Activities'), 'paid-activities heading present');
  for (const a of INCLUDED_ACTIVITIES) {
    assert.ok(html.includes(a.split(' (')[0]!), `free activity "${a}" present`);
  }
  for (const a of PAID_ACTIVITIES) {
    assert.ok(html.includes(a.name), `paid activity "${a.name}" present`);
    assert.ok(html.includes(a.rate.toLocaleString('en-IN')), `rate for "${a.name}" present`);
  }
});
