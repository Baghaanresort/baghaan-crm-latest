import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getBookings } from '@/lib/queries/bookings';
import type { UserRole } from '@/lib/types/profile';
import { VouchersClient } from './VouchersClient';

export default async function VouchersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) redirect('/login');

  const [bookings, usersData] = await Promise.all([
    getBookings(),
    supabase.from('profiles').select('name, role').in('role', ['Admin', 'Sales', 'Accounts', 'Front Office']),
  ]);

  return (
    <VouchersClient
      initialBookings={bookings}
      users={(usersData.data ?? []) as Array<{ name: string; role: string }>}
      currentUser={{ id: user.id, name: profile.name as string, role: profile.role as UserRole }}
    />
  );
}
