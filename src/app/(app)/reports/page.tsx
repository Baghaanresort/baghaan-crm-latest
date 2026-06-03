import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { UserRole } from '@/lib/types/profile';
import { ReportsClient } from './ReportsClient';
import { dbToBooking } from '@/lib/mappers/booking';
import { dbToPayment } from '@/lib/mappers/payment';
import { dbToEnquiry } from '@/lib/mappers/enquiry';

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) redirect('/login');

  const role = profile.role as UserRole;
  if (!['Sales', 'Accounts', 'Admin'].includes(role)) redirect('/dashboard');

  const [bookingsRes, paymentsRes, enquiriesRes] = await Promise.all([
    supabase.from('bookings').select('*').order('created_at', { ascending: false }),
    supabase.from('payments').select('*').order('recorded_at', { ascending: false }),
    supabase.from('enquiries').select('*').order('created_at', { ascending: false }),
  ]);

  return (
    <ReportsClient
      bookings={(bookingsRes.data ?? []).map(dbToBooking)}
      payments={(paymentsRes.data ?? []).map(dbToPayment)}
      enquiries={(enquiriesRes.data ?? []).map(dbToEnquiry)}
    />
  );
}
