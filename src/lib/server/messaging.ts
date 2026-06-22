import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppTemplate } from '@/lib/server/whatsapp';
import { sendEmail } from '@/lib/server/email';
import { outboundMessageToDb } from '@/lib/mappers/transactions';
import { formatINR } from '@/lib/utils/money';
import type { OutboundChannel, OutboundPurpose, OutboundStatus } from '@/lib/constants/transactions';

// Minimal booking shape the messaging layer needs (avoids importing the full Booking type churn).
export interface MsgBooking {
  id: string;
  guestName: string;
  contactNumber: string;
  email: string;
  confirmationNumber: string;
  enquiryId?: string | null;
}

async function logOutbound(
  supabase: SupabaseClient,
  row: {
    bookingId: string | null; enquiryId: string | null; channel: OutboundChannel;
    purpose: OutboundPurpose; destination: string; template?: string | null;
    provider?: string | null; providerMessageId?: string | null;
    status: OutboundStatus; error?: string | null; payload?: Record<string, unknown> | null;
  },
): Promise<void> {
  const id = `OM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await supabase.from('outbound_messages').insert(outboundMessageToDb({
    id, bookingId: row.bookingId, enquiryId: row.enquiryId, channel: row.channel,
    purpose: row.purpose, template: row.template ?? null, destination: row.destination,
    provider: row.provider ?? null, providerMessageId: row.providerMessageId ?? null,
    status: row.status, error: row.error ?? null, payload: row.payload ?? null,
  }));
  if (error) console.error('[logOutbound]', error);
}

// Is an own-delivery provider actually configured? If not, we skip the channel silently
// (no "failed" noise) — useful when Razorpay's own notify is doing the delivery instead.
function whatsAppConfigured(): boolean {
  const p = process.env.WHATSAPP_PROVIDER;
  if (p === 'gupshup') return !!process.env.GUPSHUP_API_KEY;
  if (p === 'twilio') return !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;
  return false;
}
function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

// Generic: try a channel, log the outcome, swallow errors (delivery must not break the caller).
async function deliver(
  supabase: SupabaseClient, b: MsgBooking, channel: OutboundChannel, purpose: OutboundPurpose,
  template: string | undefined, params: string[], mediaUrl: string | undefined,
  emailSubject: string, emailHtml: string,
): Promise<void> {
  try {
    if (channel === 'whatsapp') {
      if (!template || !b.contactNumber || !whatsAppConfigured()) return;
      const r = await sendWhatsAppTemplate(b.contactNumber, template, params, mediaUrl);
      await logOutbound(supabase, { bookingId: b.id, enquiryId: b.enquiryId ?? null, channel, purpose,
        destination: b.contactNumber, template, provider: r.provider, providerMessageId: r.providerMessageId, status: 'sent' });
    } else {
      if (!b.email || !emailConfigured()) return;
      const r = await sendEmail(b.email, emailSubject, emailHtml);
      await logOutbound(supabase, { bookingId: b.id, enquiryId: b.enquiryId ?? null, channel, purpose,
        destination: b.email, provider: r.provider, providerMessageId: r.providerMessageId, status: 'sent' });
    }
  } catch (e) {
    await logOutbound(supabase, { bookingId: b.id, enquiryId: b.enquiryId ?? null, channel, purpose,
      destination: channel === 'whatsapp' ? b.contactNumber : b.email, status: 'failed',
      error: e instanceof Error ? e.message : String(e) });
  }
}

export async function sendPaymentRequest(
  supabase: SupabaseClient, b: MsgBooking, amountRupees: number, shortUrl: string,
): Promise<void> {
  const amt = formatINR(amountRupees);
  await deliver(supabase, b, 'whatsapp', 'payment_request',
    process.env.WHATSAPP_TEMPLATE_PAYMENT_REQUEST, [b.guestName, b.confirmationNumber, amt, shortUrl], undefined,
    `Payment request — ${b.confirmationNumber}`,
    `<p>Dear ${b.guestName},</p><p>To confirm your booking <b>${b.confirmationNumber}</b>, please pay the advance of <b>${amt}</b>:</p><p><a href="${shortUrl}">${shortUrl}</a></p>`);
  await deliver(supabase, b, 'email', 'payment_request', undefined, [], undefined,
    `Payment request — ${b.confirmationNumber}`,
    `<p>Dear ${b.guestName},</p><p>To confirm your booking <b>${b.confirmationNumber}</b>, please pay the advance of <b>${amt}</b>:</p><p><a href="${shortUrl}">${shortUrl}</a></p>`);
}

export async function sendVoucher(supabase: SupabaseClient, b: MsgBooking, voucherUrl: string): Promise<void> {
  await deliver(supabase, b, 'whatsapp', 'voucher',
    process.env.WHATSAPP_TEMPLATE_VOUCHER, [b.guestName, b.confirmationNumber, voucherUrl], voucherUrl,
    `Your Baghaan booking voucher — ${b.confirmationNumber}`,
    `<p>Dear ${b.guestName},</p><p>Your booking <b>${b.confirmationNumber}</b> is confirmed. View your voucher:</p><p><a href="${voucherUrl}">${voucherUrl}</a></p>`);
  await deliver(supabase, b, 'email', 'voucher', undefined, [], undefined,
    `Your Baghaan booking voucher — ${b.confirmationNumber}`,
    `<p>Dear ${b.guestName},</p><p>Your booking <b>${b.confirmationNumber}</b> is confirmed. View your voucher:</p><p><a href="${voucherUrl}">${voucherUrl}</a></p>`);
}

export async function sendPaymentReceipt(supabase: SupabaseClient, b: MsgBooking, amountRupees: number): Promise<void> {
  const amt = formatINR(amountRupees);
  await deliver(supabase, b, 'whatsapp', 'payment_receipt',
    process.env.WHATSAPP_TEMPLATE_RECEIPT, [b.guestName, b.confirmationNumber, amt], undefined,
    `Payment received — ${b.confirmationNumber}`,
    `<p>Dear ${b.guestName},</p><p>We have received your payment of <b>${amt}</b> for ${b.confirmationNumber}. Thank you.</p>`);
}

export async function sendRefundNotice(supabase: SupabaseClient, b: MsgBooking, amountRupees: number): Promise<void> {
  const amt = formatINR(amountRupees);
  await deliver(supabase, b, 'whatsapp', 'refund_notice',
    process.env.WHATSAPP_TEMPLATE_REFUND, [b.guestName, b.confirmationNumber, amt], undefined,
    `Refund processed — ${b.confirmationNumber}`,
    `<p>Dear ${b.guestName},</p><p>Your refund of <b>${amt}</b> for ${b.confirmationNumber} has been processed.</p>`);
}
