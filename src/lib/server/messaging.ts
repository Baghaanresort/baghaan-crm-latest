import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppTemplate } from '@/lib/server/whatsapp';
import { sendEmail, type EmailAttachment } from '@/lib/server/email';
import { outboundMessageToDb } from '@/lib/mappers/transactions';
import { formatINR } from '@/lib/utils/money';
import { voucherEmail, paymentRequestEmail, paymentReceiptEmail, refundNoticeEmail } from '@/lib/server/email-templates';
import type { OutboundChannel, OutboundPurpose, OutboundStatus } from '@/lib/constants/transactions';

// Booking shape the messaging layer needs. The core fields are always set; the optional
// detail fields enrich the report-style email templates when the caller has them.
export interface MsgBooking {
  id: string;
  guestName: string;
  contactNumber: string;
  email: string;
  confirmationNumber: string;
  enquiryId?: string | null;
  arrival?: string | undefined;
  departure?: string | undefined;
  nights?: number | undefined;
  rooms?: string[] | undefined;
  adults?: number | undefined;
  children?: number | undefined;
  companyName?: string | undefined;
  totalAmount?: number | undefined;
  paid?: number | undefined;
  balance?: number | undefined;
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
  emailSubject: string, emailHtml: string, emailAttachments?: EmailAttachment[],
): Promise<void> {
  try {
    if (channel === 'whatsapp') {
      if (!template || !b.contactNumber || !whatsAppConfigured()) return;
      const r = await sendWhatsAppTemplate(b.contactNumber, template, params, mediaUrl);
      await logOutbound(supabase, { bookingId: b.id, enquiryId: b.enquiryId ?? null, channel, purpose,
        destination: b.contactNumber, template, provider: r.provider, providerMessageId: r.providerMessageId, status: 'sent' });
    } else {
      if (!b.email || !emailConfigured()) return;
      const r = await sendEmail(b.email, emailSubject, emailHtml, emailAttachments);
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
  const e = paymentRequestEmail(b, amountRupees, shortUrl);
  await deliver(supabase, b, 'whatsapp', 'payment_request',
    process.env.WHATSAPP_TEMPLATE_PAYMENT_REQUEST, [b.guestName, b.confirmationNumber, amt, shortUrl], undefined,
    e.subject, e.html);
  await deliver(supabase, b, 'email', 'payment_request', undefined, [], undefined, e.subject, e.html);
}

// `pdf` (the rendered voucher) is attached to the email and used as the WhatsApp
// document, so the guest receives the actual PDF — like an OTA confirmation.
export async function sendVoucher(
  supabase: SupabaseClient, b: MsgBooking, voucherUrl: string, pdf?: Buffer | null,
): Promise<void> {
  const e = voucherEmail(b, voucherUrl);
  const pdfUrl = voucherUrl.replace('/api/voucher/view', '/api/pdf/voucher');
  const filename = `Voucher-${(b.confirmationNumber || 'BAGHAAN').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'voucher'}.pdf`;
  const attachments: EmailAttachment[] | undefined = pdf && pdf.length
    ? [{ filename, content: pdf.toString('base64'), contentType: 'application/pdf' }]
    : undefined;

  // WhatsApp gets the PDF link as the document media; email gets the file attached.
  await deliver(supabase, b, 'whatsapp', 'voucher',
    process.env.WHATSAPP_TEMPLATE_VOUCHER, [b.guestName, b.confirmationNumber, voucherUrl], pdfUrl,
    e.subject, e.html);
  await deliver(supabase, b, 'email', 'voucher', undefined, [], undefined, e.subject, e.html, attachments);
}

export async function sendPaymentReceipt(supabase: SupabaseClient, b: MsgBooking, amountRupees: number): Promise<void> {
  const amt = formatINR(amountRupees);
  const e = paymentReceiptEmail(b, amountRupees);
  await deliver(supabase, b, 'whatsapp', 'payment_receipt',
    process.env.WHATSAPP_TEMPLATE_RECEIPT, [b.guestName, b.confirmationNumber, amt], undefined,
    e.subject, e.html);
  await deliver(supabase, b, 'email', 'payment_receipt', undefined, [], undefined, e.subject, e.html);
}

export async function sendRefundNotice(supabase: SupabaseClient, b: MsgBooking, amountRupees: number): Promise<void> {
  const amt = formatINR(amountRupees);
  const e = refundNoticeEmail(b, amountRupees);
  await deliver(supabase, b, 'whatsapp', 'refund_notice',
    process.env.WHATSAPP_TEMPLATE_REFUND, [b.guestName, b.confirmationNumber, amt], undefined,
    e.subject, e.html);
  await deliver(supabase, b, 'email', 'refund_notice', undefined, [], undefined, e.subject, e.html);
}
