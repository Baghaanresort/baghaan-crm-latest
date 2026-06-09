import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getBookingById } from '@/lib/queries/bookings';
import { getPayments } from '@/lib/queries/payments';
import type { UserRole } from '@/lib/types/profile';
import { CorporateDetailClient } from './CorporateDetailClient';

export default async function CorporateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) redirect('/login');

  const [booking, payments, usersData] = await Promise.all([
    getBookingById(id),
    getPayments(),
    supabase.from('profiles').select('name, role').in('role', ['Admin', 'Sales', 'Accounts', 'Front Office']),
  ]);

  if (!booking || booking.bookingType !== 'corporate') redirect('/corporate');

  return (
    <CorporateDetailClient
      booking={booking}
      payments={payments.filter(p => p.bookingId === booking.id)}
      users={(usersData.data ?? []) as Array<{ name: string; role: string }>}
      currentUser={{ id: user.id, name: profile.name as string, role: profile.role as UserRole }}
    />
  );
}
