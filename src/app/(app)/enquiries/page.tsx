import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getEnquiries } from '@/lib/queries/enquiries';
import { getActiveBookings } from '@/lib/queries/bookings';
import { releaseExpiredEnquiryHolds } from '@/lib/actions/enquiries';
import { dbToBooking } from '@/lib/mappers/booking';
import { dbToPayment } from '@/lib/mappers/payment';
import type { UserRole } from '@/lib/types/profile';
import { EnquiriesClient } from './EnquiriesClient';

export default async function EnquiriesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) redirect('/login');

  // Release any expired holds before reading the list, so stages are current.
  await releaseExpiredEnquiryHolds();

  const [enquiries, usersData, activeBookings] = await Promise.all([
    getEnquiries(),
    supabase.from('profiles').select('name, role').in('role', ['Admin', 'Sales', 'Accounts', 'Front Office']),
    getActiveBookings(),
  ]);

  // Pull the held bookings + their payments for in-flight enquiries (Block summary + PAY).
  const heldIds = enquiries.map(e => e.heldBookingId).filter((x): x is string => !!x);
  const heldBookingsData = heldIds.length
    ? (await supabase.from('bookings').select('*').in('id', heldIds)).data ?? []
    : [];
  const heldPaymentsData = heldIds.length
    ? (await supabase.from('payments').select('*').in('booking_id', heldIds)).data ?? []
    : [];
  const heldBookings = heldBookingsData.map(dbToBooking);
  const heldPayments = heldPaymentsData.map(dbToPayment);

  return (
    <EnquiriesClient
      initialEnquiries={enquiries}
      heldBookings={heldBookings}
      activeBookings={activeBookings}
      heldPayments={heldPayments}
      users={(usersData.data ?? []) as Array<{ name: string; role: string }>}
      currentUser={{ id: user.id, name: profile.name as string, role: profile.role as UserRole }}
    />
  );
}
