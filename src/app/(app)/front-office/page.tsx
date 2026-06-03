import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getBookings } from '@/lib/queries/bookings';
import { getPayments } from '@/lib/queries/payments';
import type { UserRole } from '@/lib/types/profile';
import { FrontOfficeClient } from './FrontOfficeClient';

export default async function FrontOfficePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) redirect('/login');

  const [bookings, payments] = await Promise.all([getBookings(), getPayments()]);

  return (
    <FrontOfficeClient
      initialBookings={bookings}
      initialPayments={payments}
      currentUser={{ id: user.id, name: profile.name as string, role: profile.role as UserRole }}
    />
  );
}
