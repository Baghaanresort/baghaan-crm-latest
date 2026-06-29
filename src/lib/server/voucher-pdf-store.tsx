import 'server-only';
import { createHash } from 'node:crypto';
import { renderToBuffer } from '@react-pdf/renderer';
import { createAdminClient } from '@/lib/supabase/admin';
import { dbToBooking } from '@/lib/mappers/booking';
import { dbToPayment } from '@/lib/mappers/payment';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import { VoucherPdf } from '@/lib/pdf/VoucherPdf';

// Supabase Storage (S3-compatible) bucket that holds the generated voucher PDFs.
export const VOUCHER_BUCKET = 'baghaan-crm-voucher';

// Content-addressed object key: changing any voucher-visible field changes the
// fingerprint, so a stale object is never served and no mutation hooks are needed.
// The guest-facing URL stays /api/pdf/voucher?bookingId=… regardless of the key.
function fingerprint(b: Booking, payments: Payment[]): string {
  const material = JSON.stringify({
    // Template version — bump when the voucher layout changes so already-cached
    // PDFs are superseded even when the booking data is unchanged. v2: brand logo.
    v: 2,
    s: b.status, a: b.arrival, d: b.departure, n: b.nights, ad: b.adults, ch: b.children,
    r: b.rooms, t: b.totalAmount, ap: b.advancePaid, rb: b.rateBreakdown, inc: b.inclusions,
    g: b.guestName, c: b.contactNumber, e: b.email, co: b.companyName, gst: b.gstNumber,
    cn: b.confirmationNumber, he: b.holdExpiresAt,
    p: payments.map(p => [p.paymentDate, p.amount, p.mode, p.type]),
  });
  return createHash('sha1').update(material).digest('hex').slice(0, 12);
}

const keyFor = (bookingId: string, fp: string) => `${bookingId}-${fp}.pdf`;

interface VoucherData { booking: Booking; payments: Payment[]; }

// Service-role read of the booking + its verified payments (callers must authorize first).
async function loadVoucherData(bookingId: string): Promise<VoucherData | null> {
  const db = createAdminClient();
  const { data } = await db.from('bookings').select('*').eq('id', bookingId).single();
  if (!data) return null;
  const { data: pays } = await db.from('payments').select('*')
    .eq('booking_id', bookingId).eq('verified', true).order('payment_date', { ascending: true });
  return { booking: dbToBooking(data), payments: (pays ?? []).map(dbToPayment) };
}

// Remove older PDF objects for this booking (previous fingerprints / legacy keys).
async function pruneOldVersions(bookingId: string, keepKey: string): Promise<void> {
  try {
    const db = createAdminClient();
    const { data: files } = await db.storage.from(VOUCHER_BUCKET).list('', { search: bookingId });
    const stale = (files ?? []).map(f => f.name).filter(n => n.startsWith(bookingId) && n !== keepKey);
    if (stale.length) await db.storage.from(VOUCHER_BUCKET).remove(stale);
  } catch { /* best-effort housekeeping */ }
}

// Render the voucher PDF from current data. Callers MUST authorize the request first.
export async function renderVoucher(bookingId: string): Promise<Buffer | null> {
  const data = await loadVoucherData(bookingId);
  if (!data) return null;
  const buf = await renderToBuffer(<VoucherPdf booking={data.booking} payments={data.payments} />);
  return Buffer.from(buf);
}

// Serve the stored, content-addressed PDF; on a miss render it, upload it to the
// bucket, prune superseded versions, and return it. Always reflects current data.
export async function getOrCreateVoucherPdf(bookingId: string): Promise<Buffer | null> {
  const data = await loadVoucherData(bookingId);
  if (!data) return null;
  const key = keyFor(bookingId, fingerprint(data.booking, data.payments));
  const db = createAdminClient();

  try {
    const dl = await db.storage.from(VOUCHER_BUCKET).download(key);
    if (dl.data) return Buffer.from(await dl.data.arrayBuffer());
  } catch { /* fall through to render */ }

  const buffer = Buffer.from(await renderToBuffer(<VoucherPdf booking={data.booking} payments={data.payments} />));
  const { error } = await db.storage.from(VOUCHER_BUCKET)
    .upload(key, buffer, { contentType: 'application/pdf', upsert: true });
  if (error) { console.error('[getOrCreateVoucherPdf upload]', error.message); return buffer; }
  await pruneOldVersions(bookingId, key);
  return buffer;
}

// Eagerly generate + store the voucher PDF (called when a voucher is sent so the
// bucket is primed). Best-effort: returns the object key or null, never throws.
export async function storeVoucherPdf(bookingId: string): Promise<string | null> {
  try {
    const data = await loadVoucherData(bookingId);
    if (!data) return null;
    const key = keyFor(bookingId, fingerprint(data.booking, data.payments));
    const db = createAdminClient();
    const buffer = Buffer.from(await renderToBuffer(<VoucherPdf booking={data.booking} payments={data.payments} />));
    const { error } = await db.storage.from(VOUCHER_BUCKET)
      .upload(key, buffer, { contentType: 'application/pdf', upsert: true });
    if (error) { console.error('[storeVoucherPdf]', error.message); return null; }
    await pruneOldVersions(bookingId, key);
    return key;
  } catch (e) {
    console.error('[storeVoucherPdf]', e instanceof Error ? e.message : e);
    return null;
  }
}
