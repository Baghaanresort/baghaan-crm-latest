import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getBookings } from '@/lib/queries/bookings';
import { getPayments } from '@/lib/queries/payments';
import type { UserRole } from '@/lib/types/profile';
import { CorporateClient } from './CorporateClient';

export default async function CorporatePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) redirect('/login');

  const [bookings, payments, usersData] = await Promise.all([
    getBookings(),
    getPayments(),
    supabase.from('profiles').select('name, role'),
  ]);

  const corporateBookings = bookings.filter(b => b.bookingType === 'corporate');

  return (
    <CorporateClient
      initialBookings={corporateBookings}
      initialPayments={payments}
      users={(usersData.data ?? []) as Array<{ name: string; role: string }>}
      currentUser={{ id: user.id, name: profile.name as string, role: profile.role as UserRole }}
    />
  );
}
