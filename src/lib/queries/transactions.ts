import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { dbToPaymentLink, dbToOutboundMessage } from '@/lib/mappers/transactions';
import type { PaymentLink, OutboundMessage } from '@/lib/types/transactions';

export async function getPaymentLinksForBooking(bookingId: string): Promise<PaymentLink[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('payment_links')
    .select('*').eq('booking_id', bookingId).order('created_at', { ascending: false });
  return (data ?? []).map(dbToPaymentLink);
}

export async function getOutboundMessagesForBooking(bookingId: string): Promise<OutboundMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('outbound_messages')
    .select('*').eq('booking_id', bookingId).order('created_at', { ascending: false });
  return (data ?? []).map(dbToOutboundMessage);
}

export async function getOpenPaymentLinks(): Promise<PaymentLink[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('payment_links')
    .select('*').in('status', ['created', 'sent', 'partially_paid']);
  return (data ?? []).map(dbToPaymentLink);
}
