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

// Batch variants — fetch links/messages for many bookings in a single round-trip,
// avoiding N+1 when a list surface (e.g. Accounts) needs to show status per booking.
// Mirrors the `.in('booking_id', ids)` no-N+1 pattern used in guests/[id]/page.tsx.
export async function getPaymentLinksForBookings(bookingIds: string[]): Promise<PaymentLink[]> {
  if (bookingIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from('payment_links')
    .select('*').in('booking_id', bookingIds).order('created_at', { ascending: false });
  return (data ?? []).map(dbToPaymentLink);
}

export async function getOutboundMessagesForBookings(bookingIds: string[]): Promise<OutboundMessage[]> {
  if (bookingIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from('outbound_messages')
    .select('*').in('booking_id', bookingIds).order('created_at', { ascending: false });
  return (data ?? []).map(dbToOutboundMessage);
}

export async function getOpenPaymentLinks(): Promise<PaymentLink[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('payment_links')
    .select('*').in('status', ['created', 'sent', 'partially_paid']);
  return (data ?? []).map(dbToPaymentLink);
}
