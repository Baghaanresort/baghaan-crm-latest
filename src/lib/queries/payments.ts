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
