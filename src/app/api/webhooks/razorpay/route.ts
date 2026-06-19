import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyWebhookSignature } from '@/lib/server/razorpay';
import { parseRazorpayEvent } from '@/lib/server/razorpay-events';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // 1. RAW body — read before any parsing so the HMAC matches byte-for-byte.
  const raw = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';
  const eventId = request.headers.get('x-razorpay-event-id') ?? `evt_${Date.now()}`;
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';

  const valid = verifyWebhookSignature(raw, signature, secret);

  let parsed;
  try { parsed = parseRazorpayEvent(JSON.parse(raw)); } catch { parsed = { kind: 'ignored' as const }; }

  const admin = createAdminClient();

  // 2. Dedupe + audit. Insert-if-new (PK on event id). If it already exists, ack 200.
  const { error: insErr } = await admin.from('webhook_events').insert({
    id: eventId,
    event_type: (JSON.parse(raw || '{}') as { event?: string }).event ?? 'unknown',
    entity_id: parsed.linkId ?? parsed.paymentId ?? parsed.refundId ?? null,
    signature_valid: valid,
    processed: false,
    payload: raw ? JSON.parse(raw) : {},
  });
  // 23505 = unique_violation → already received; treat as success (idempotent replay).
  if (insErr && insErr.code !== '23505') {
    console.error('[razorpay webhook] persist failed', insErr);
    return new Response('error', { status: 500 });
  }
  if (insErr?.code === '23505') return new Response('duplicate', { status: 200 });

  // 3. Reject invalid signatures AFTER logging (so we have the audit trail).
  if (!valid) return new Response('invalid signature', { status: 400 });

  // 4. Side effects are wired in Task 12 / 18. For now: ack.
  await admin.from('webhook_events').update({ processed: true, processed_at: new Date().toISOString() }).eq('id', eventId);
  return new Response('ok', { status: 200 });
}
