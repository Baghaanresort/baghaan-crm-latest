import 'server-only';
import { formatINR } from '@/lib/utils/money';
import type { MsgBooking } from '@/lib/server/messaging';

// Branded, report-style HTML emails. Email clients are picky: table layout + inline
// styles + web-safe fonts only. Keep width ≤ 600px. All user text is HTML-escaped.

const C = {
  emerald: '#064e3b',
  cream: '#fef3c7',
  mint: '#a7f3d0',
  ink: '#1c1917',
  body: '#292524',
  muted: '#78716c',
  faint: '#a8a29e',
  line: '#e7e5e4',
  panel: '#fafaf9',
  page: '#f5f5f4',
};
const SUPPORT = process.env.SUPPORT_EMAIL || 'bookings@baghaan.com';

function esc(s: string | undefined | null): string {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

function shell(title: string, subtitle: string, bodyHtml: string): string {
  return `<div style="background:${C.page};margin:0;padding:24px 12px;font-family:Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid ${C.line};">
    <tr><td style="background:${C.emerald};padding:26px 32px;">
      <div style="font-family:Georgia,'Times New Roman',serif;color:${C.cream};font-size:24px;letter-spacing:3px;">BAGHAAN</div>
      <div style="color:${C.mint};font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-top:3px;">Orchard Retreat</div>
    </td></tr>
    <tr><td style="padding:26px 32px 4px;">
      <div style="font-family:Georgia,serif;font-size:20px;color:${C.ink};">${esc(title)}</div>
      ${subtitle ? `<div style="color:${C.muted};font-size:12px;letter-spacing:.5px;margin-top:4px;font-family:monospace;">${esc(subtitle)}</div>` : ''}
    </td></tr>
    <tr><td style="padding:10px 32px 26px;color:${C.body};font-size:14px;line-height:1.65;">${bodyHtml}</td></tr>
    <tr><td style="background:${C.panel};border-top:1px solid ${C.line};padding:20px 32px;color:${C.muted};font-size:12px;line-height:1.6;">
      <strong style="color:${C.body};">Baghaan Orchard Retreat</strong><br/>
      Need help? Reply to this email or write to <a href="mailto:${SUPPORT}" style="color:${C.emerald};">${SUPPORT}</a>.<br/>
      <span style="color:${C.faint};">This is an automated message about your reservation.</span>
    </td></tr>
  </table>
</div>`;
}

function row(label: string, valueHtml: string): string {
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid ${C.line};color:${C.muted};font-size:11px;text-transform:uppercase;letter-spacing:.6px;vertical-align:top;width:40%;">${esc(label)}</td>
    <td style="padding:9px 0;border-bottom:1px solid ${C.line};color:${C.ink};font-size:14px;text-align:right;font-weight:600;">${valueHtml || '—'}</td>
  </tr>`;
}
function table(rowsHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;">${rowsHtml}</table>`;
}
function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td style="background:${C.emerald};">
    <a href="${esc(url)}" style="display:inline-block;padding:13px 30px;color:${C.cream};text-decoration:none;font-size:13px;letter-spacing:1.5px;font-weight:600;">${esc(label)}</a>
  </td></tr></table>`;
}

function stayLine(b: MsgBooking): string {
  if (!b.arrival || !b.departure) return '';
  const n = b.nights ? ` · ${b.nights} night${b.nights === 1 ? '' : 's'}` : '';
  return `${esc(b.arrival)} → ${esc(b.departure)}${n}`;
}
function guestsLine(b: MsgBooking): string {
  if (b.adults === undefined) return '';
  return `${b.adults} adult${b.adults === 1 ? '' : 's'}${b.children ? ` · ${b.children} child${b.children === 1 ? '' : 'ren'}` : ''}`;
}

export function voucherEmail(b: MsgBooking, voucherUrl: string): { subject: string; html: string } {
  const rooms = b.rooms?.length ? esc(b.rooms.join(', ')) : '';
  const detail = table([
    row('Confirmation', esc(b.confirmationNumber)),
    row('Guest', esc(b.guestName)),
    b.companyName ? row('Company', esc(b.companyName)) : '',
    stayLine(b) ? row('Stay', stayLine(b)) : '',
    rooms ? row('Rooms', rooms) : '',
    guestsLine(b) ? row('Guests', guestsLine(b)) : '',
  ].join(''));
  const fin = b.totalAmount !== undefined ? table([
    row('Package total', formatINR(b.totalAmount)),
    b.paid !== undefined ? row('Paid', `<span style="color:${C.emerald};">${formatINR(b.paid)}</span>`) : '',
    b.balance !== undefined ? row('Balance due', `<span style="color:${b.balance > 0 ? '#b91c1c' : C.emerald};">${formatINR(Math.abs(b.balance))}</span>`) : '',
  ].join('')) : '';
  const body = `<p style="margin:0 0 10px;">Dear ${esc(b.guestName)},</p>
    <p style="margin:0 0 2px;">Your reservation is <strong style="color:${C.emerald};">confirmed</strong>. We can't wait to host you at the orchard. Your details:</p>
    ${detail}${fin}
    ${button(voucherUrl, 'VIEW / DOWNLOAD VOUCHER')}
    <p style="margin:4px 0 0;color:${C.muted};font-size:13px;">If anything above needs a change, just reply to this email.</p>`;
  return { subject: `Your Baghaan booking is confirmed — ${b.confirmationNumber}`, html: shell('Booking Voucher', b.confirmationNumber, body) };
}

export function paymentRequestEmail(b: MsgBooking, amountRupees: number, shortUrl: string): { subject: string; html: string } {
  const rooms = b.rooms?.length ? esc(b.rooms.join(', ')) : '';
  const detail = table([
    row('Confirmation', esc(b.confirmationNumber)),
    row('Guest', esc(b.guestName)),
    stayLine(b) ? row('Stay', stayLine(b)) : '',
    rooms ? row('Rooms', rooms) : '',
    b.totalAmount !== undefined ? row('Package total', formatINR(b.totalAmount)) : '',
    row('Advance to confirm', `<span style="color:${C.emerald};font-size:16px;">${formatINR(amountRupees)}</span>`),
  ].join(''));
  const body = `<p style="margin:0 0 10px;">Dear ${esc(b.guestName)},</p>
    <p style="margin:0 0 2px;">To confirm your reservation, please pay the advance below — your rooms are held until we receive it.</p>
    ${detail}
    ${button(shortUrl, `PAY ${formatINR(amountRupees)} SECURELY`)}
    <p style="margin:4px 0 0;color:${C.muted};font-size:13px;">Secured by Razorpay. If the button doesn't work, open:<br/>
    <a href="${esc(shortUrl)}" style="color:${C.emerald};word-break:break-all;">${esc(shortUrl)}</a></p>`;
  return { subject: `Confirm your Baghaan booking — pay ${formatINR(amountRupees)}`, html: shell('Payment Request', b.confirmationNumber, body) };
}

export function paymentReceiptEmail(b: MsgBooking, amountRupees: number): { subject: string; html: string } {
  const body = `<p style="margin:0 0 10px;">Dear ${esc(b.guestName)},</p>
    <p style="margin:0 0 2px;">We've received your payment of <strong style="color:${C.emerald};">${formatINR(amountRupees)}</strong> toward booking <strong>${esc(b.confirmationNumber)}</strong>. Thank you!</p>
    <p style="margin:10px 0 0;color:${C.muted};font-size:13px;">Your confirmation voucher will follow shortly.</p>`;
  return { subject: `Payment received — ${b.confirmationNumber}`, html: shell('Payment Received', b.confirmationNumber, body) };
}

export function refundNoticeEmail(b: MsgBooking, amountRupees: number): { subject: string; html: string } {
  const body = `<p style="margin:0 0 10px;">Dear ${esc(b.guestName)},</p>
    <p style="margin:0 0 2px;">Your refund of <strong style="color:${C.emerald};">${formatINR(amountRupees)}</strong> for booking <strong>${esc(b.confirmationNumber)}</strong> has been processed. It should reflect in your account within 5–7 business days.</p>`;
  return { subject: `Refund processed — ${b.confirmationNumber}`, html: shell('Refund Processed', b.confirmationNumber, body) };
}
