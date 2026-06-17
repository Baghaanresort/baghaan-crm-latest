import { createClient } from '@/lib/supabase/server';
import { dbToPayment } from '@/lib/mappers/payment';
import type { Payment } from '@/lib/types/payment';

export async function getPayments(): Promise<Payment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('payments')
    .select('*')
    .order('recorded_at', { ascending: false });
  return (data ?? []).map(dbToPayment);
}

export async function getPaymentsForBooking(bookingId: string): Promise<Payment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('payments')
    .select('*')
    .eq('booking_id', bookingId)
    .order('recorded_at', { ascending: false });
  return (data ?? []).map(dbToPayment);
}

// Accounts-verified payments for a booking, oldest-first — the chronological
// ledger shown on the guest voucher. Unverified (recorded but not yet approved)
// payments are intentionally excluded so the voucher only reflects money that
// Accounts has confirmed.
export async function getVerifiedPaymentsForBooking(bookingId: string): Promise<Payment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('payments')
    .select('*')
    .eq('booking_id', bookingId)
    .eq('verified', true)
    .order('payment_date', { ascending: true });
  return (data ?? []).map(dbToPayment);
}
