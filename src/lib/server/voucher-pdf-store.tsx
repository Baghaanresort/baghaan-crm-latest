import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { createAdminClient } from '@/lib/supabase/admin';
import { dbToBooking } from '@/lib/mappers/booking';
import { dbToPayment } from '@/lib/mappers/payment';
import { VoucherPdf } from '@/lib/pdf/VoucherPdf';

// Supabase Storage bucket that holds the generated voucher PDFs (created by the user).
export const VOUCHER_BUCKET = 'baghaan-crm-voucher';
const pathFor = (bookingId: string) => `${bookingId}.pdf`;

// Render the voucher PDF for a booking from *current* data. Service-role read
// (bypasses RLS) — callers MUST authorize the request before invoking this.
export async function renderVoucher(bookingId: string): Promise<Buffer | null> {
  const db = createAdminClient();
  const { data } = await db.from('bookings').select('*').eq('id', bookingId).single();
  if (!data) return null;
  const { data: pays } = await db.from('payments').select('*').eq('booking_id', bookingId);
  const payments = (pays ?? []).map(dbToPayment);
  const buf = await renderToBuffer(<VoucherPdf booking={dbToBooking(data)} payments={payments} />);
  return Buffer.from(buf);
}

// Generate + upload the voucher PDF to the bucket. Best-effort: returns the path or null,
// never throws (a storage hiccup must not break the Send Voucher flow).
export async function storeVoucherPdf(bookingId: string): Promise<string | null> {
  try {
    const buffer = await renderVoucher(bookingId);
    if (!buffer) return null;
    const db = createAdminClient();
    const { error } = await db.storage.from(VOUCHER_BUCKET)
      .upload(pathFor(bookingId), buffer, { contentType: 'application/pdf', upsert: true });
    if (error) { console.error('[storeVoucherPdf]', error.message); return null; }
    return pathFor(bookingId);
  } catch (e) {
    console.error('[storeVoucherPdf]', e instanceof Error ? e.message : e);
    return null;
  }
}

// Note: downloads deliberately render fresh (see /api/pdf/voucher) instead of
// streaming the stored object, so an edited booking / new payment is never served
// from a stale snapshot. storeVoucherPdf keeps the bucket copy as the as-sent record.
