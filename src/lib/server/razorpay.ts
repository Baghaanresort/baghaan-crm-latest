import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const RZP_BASE = 'https://api.razorpay.com/v1';

function authHeader(): string {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error('Razorpay keys are not configured');
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

// HMAC-SHA256 of the RAW body. Constant-time compare. Never throws on bad input.
export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export interface RazorpayLink {
  id: string;
  short_url: string;
  status: string;
  reference_id: string;
  amount: number;
  amount_paid: number;
}

export interface CreatePaymentLinkArgs {
  amountPaise: number;
  referenceId: string;
  description: string;
  customer: { name: string; contact?: string; email?: string };
  notes?: Record<string, string>;
  expireBy?: number; // unix seconds
  callbackUrl?: string;
}

async function rzpFetch(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${RZP_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: authHeader(), ...(init.headers ?? {}) },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = json['error'] as { description?: string } | undefined;
    throw new Error(`Razorpay ${path} ${res.status}: ${errObj?.description ?? JSON.stringify(json)}`);
  }
  return json;
}

export async function createPaymentLink(
  args: CreatePaymentLinkArgs,
): Promise<{ id: string; shortUrl: string; status: string }> {
  // By default let Razorpay deliver the link by SMS + email to the customer (zero setup).
  // Enable each channel ONLY when we actually have that value, so a phone-only booking
  // sends an SMS and skips email rather than tripping Razorpay's "email is required for
  // email notification" validation (which would fail the whole link creation).
  // Set RAZORPAY_NOTIFY=false once your own WhatsApp/email delivery is configured.
  const notifyOn = process.env.RAZORPAY_NOTIFY !== 'false';
  // Once our own branded email sender is configured (Resend API key + a verified
  // custom-domain EMAIL_FROM), WE email the payment link (see sendPaymentRequest), so
  // suppress Razorpay's duplicate email. We still let Razorpay deliver SMS + WhatsApp.
  // The EMAIL_FROM must be a real domain — Resend's default onboarding@resend.dev can
  // only reach the account owner, so if that's all we have we MUST keep Razorpay's
  // email or the guest gets nothing. Falls back to Razorpay email when unconfigured.
  // Override with RAZORPAY_NOTIFY=false (kills all Razorpay notifications).
  const emailFrom = process.env.EMAIL_FROM ?? '';
  const ownEmail = !!process.env.RESEND_API_KEY && !!emailFrom && !/resend\.dev/i.test(emailFrom);
  const body: Record<string, unknown> = {
    amount: args.amountPaise,
    currency: 'INR',
    reference_id: args.referenceId,
    description: args.description,
    customer: args.customer,
    notify: {
      sms: notifyOn && !!args.customer.contact,
      email: notifyOn && !!args.customer.email && !ownEmail,
      whatsapp: notifyOn && !!args.customer.contact,
    },
    reminder_enable: true,
    notes: args.notes ?? {},
  };
  if (args.expireBy) body['expire_by'] = args.expireBy;
  if (args.callbackUrl) { body['callback_url'] = args.callbackUrl; body['callback_method'] = 'get'; }

  const json = await rzpFetch('/payment_links', { method: 'POST', body: JSON.stringify(body) });
  return { id: json['id'] as string, shortUrl: json['short_url'] as string, status: json['status'] as string };
}

export async function getPaymentLink(id: string): Promise<RazorpayLink> {
  const json = await rzpFetch(`/payment_links/${id}`, { method: 'GET' });
  return json as unknown as RazorpayLink;
}

export async function cancelPaymentLink(id: string): Promise<void> {
  await rzpFetch(`/payment_links/${id}/cancel`, { method: 'POST', body: '{}' });
}

export async function createRefund(
  paymentId: string, amountPaise: number, notes?: Record<string, string>,
): Promise<{ id: string; status: string }> {
  const json = await rzpFetch(`/payments/${paymentId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ amount: amountPaise, notes: notes ?? {} }),
  });
  return { id: json['id'] as string, status: json['status'] as string };
}

export async function getRefund(paymentId: string, refundId: string): Promise<{ id: string; status: string }> {
  const json = await rzpFetch(`/payments/${paymentId}/refunds/${refundId}`, { method: 'GET' });
  return { id: json['id'] as string, status: json['status'] as string };
}
