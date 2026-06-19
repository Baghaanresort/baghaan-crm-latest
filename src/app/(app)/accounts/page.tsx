import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getBookingsForAccounts } from '@/lib/queries/bookings';
import { getPayments } from '@/lib/queries/payments';
import { getPaymentLinksForBookings, getOutboundMessagesForBookings } from '@/lib/queries/transactions';
import type { UserRole } from '@/lib/types/profile';
import { AccountsClient } from './AccountsClient';

export default async function AccountsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) redirect('/login');

  const [bookings, payments] = await Promise.all([getBookingsForAccounts(), getPayments()]);

  // Payment links + delivery messages for every booking shown here — fetched in one
  // round-trip each (no N+1) so the per-booking PaymentModal can show what was sent
  // and whether it was paid.
  const bookingIds = bookings.map(b => b.id);
  const [paymentLinks, messages] = await Promise.all([
    getPaymentLinksForBookings(bookingIds),
    getOutboundMessagesForBookings(bookingIds),
  ]);

  return (
    <AccountsClient
      initialBookings={bookings}
      initialPayments={payments}
      initialPaymentLinks={paymentLinks}
      initialMessages={messages}
      currentUser={{ id: user.id, name: profile.name as string, role: profile.role as UserRole }}
    />
  );
}
