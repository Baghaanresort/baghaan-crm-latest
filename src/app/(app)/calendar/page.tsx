import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getBookings } from '@/lib/queries/bookings';
import type { UserRole } from '@/lib/types/profile';
import { CalendarClient } from './CalendarClient';

export default async function CalendarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) redirect('/login');
  const bookings = await getBookings();
  return <CalendarClient initialBookings={bookings} />;
}
