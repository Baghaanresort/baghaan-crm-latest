import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyWebhookSignature } from '@/lib/server/razorpay';
import { parseRazorpayEvent } from '@/lib/server/razorpay-events';
import { onPaymentLinkPaid, onPaymentLinkPartiallyPaid } from '@/lib/server/transactionEngine';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // 1. RAW body — read before any parsing so the HMAC matches byte-for-byte.
  const raw = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';
  const eventId = request.headers.get('x-razorpay-event-id') ?? `evt_${Date.now()}`;
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';

  const valid = verifyWebhookSignature(raw, signature, secret);

  // Parse the raw body ONCE — reused for event_type, payload, and parseRazorpayEvent.
  // A malformed-but-valid-signature body can still fail JSON.parse, so guard it.
  let body: unknown = {};
  let parsed: ReturnType<typeof parseRazorpayEvent> = { kind: 'ignored' };
  try {
    body = raw ? JSON.parse(raw) : {};
    parsed = parseRazorpayEvent(body);
  } catch {
    body = {};
    parsed = { kind: 'ignored' };
  }
  const eventType = (body as { event?: string }).event ?? 'unknown';

  const admin = createAdminClient();

  // 2. Dedupe + audit. Insert-if-new (PK on event id). If it already exists, ack 200.
  const { error: insErr } = await admin.from('webhook_events').insert({
    id: eventId,
    event_type: eventType,
    entity_id: parsed.linkId ?? parsed.paymentId ?? parsed.refundId ?? null,
    signature_valid: valid,
    processed: false,
    payload: body,
  });
  // 23505 = unique_violation → already received; treat as success (idempotent replay).
  if (insErr && insErr.code !== '23505') {
    console.error('[razorpay webhook] persist failed', insErr);
    return new Response('error', { status: 500 });
  }
  if (insErr?.code === '23505') return new Response('duplicate', { status: 200 });

  // 3. Reject invalid signatures AFTER logging (so we have the audit trail).
  if (!valid) return new Response('invalid signature', { status: 400 });

  // 4. Dispatch money side effects. Idempotency rests on the payments unique index
  //    + the existing-row pre-check inside the handlers, NOT on this insert succeeding.
  try {
    if (parsed.kind === 'payment_link_paid') await onPaymentLinkPaid(admin, parsed);
    else if (parsed.kind === 'payment_link_partially_paid') await onPaymentLinkPartiallyPaid(admin, parsed);
    else if (parsed.kind === 'payment_link_closed') {
      if (parsed.linkId) await admin.from('payment_links')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('razorpay_link_id', parsed.linkId).in('status', ['created', 'sent', 'partially_paid']);
    }
    // refund_processed / refund_failed wired in Task 18.
    await admin.from('webhook_events').update({ processed: true, processed_at: new Date().toISOString() }).eq('id', eventId);
  } catch (e) {
    await admin.from('webhook_events').update({ error: e instanceof Error ? e.message : String(e) }).eq('id', eventId);
    console.error('[razorpay webhook] handler', e);
    return new Response('handler error', { status: 500 });  // Razorpay retries on non-2xx
  }
  return new Response('ok', { status: 200 });
}
