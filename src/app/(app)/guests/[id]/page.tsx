import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { dbToBooking } from '@/lib/mappers/booking';
import { dbToPayment } from '@/lib/mappers/payment';
import { GuestProfileClient } from './GuestProfileClient';
import type { UserRole } from '@/lib/types/profile';

export default async function GuestProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) redirect('/login');

  const role = profile.role as UserRole;
  if (!['Sales', 'Front Office', 'Admin'].includes(role)) redirect('/dashboard');

  // All data in parallel — no waterfalls
  const [guestRes, bookingsRes] = await Promise.all([
    supabase.from('guests').select('*').eq('id', id).single(),
    supabase.from('bookings').select('*').eq('guest_id', id).order('arrival', { ascending: false }),
  ]);

  if (!guestRes.data) notFound();

  const g = guestRes.data;
  const guest = {
    id: g['id'] as string,
    name: (g['name'] as string) || '',
    phone: g['phone'] as string,
    email: (g['email'] as string) || '',
    companyName: (g['company_name'] as string) || '',
    gstNumber: (g['gst_number'] as string) || '',
    preferences: (g['preferences'] as string) || '',
    internalNotes: (g['internal_notes'] as string) || '',
    createdAt: g['created_at'] as string,
    updatedAt: g['updated_at'] as string,
  };

  const bookings = (bookingsRes.data ?? []).map(dbToBooking);

  // Fetch payments for all guest bookings in one query (no N+1)
  const bookingIds = bookings.map(b => b.id);
  const paymentsData = bookingIds.length > 0
    ? (await supabase.from('payments').select('*').in('booking_id', bookingIds)).data ?? []
    : [];
  const payments = paymentsData.map(dbToPayment);

  return (
    <GuestProfileClient
      guest={guest}
      bookings={bookings}
      payments={payments}
      currentUser={{ id: user.id, name: profile.name as string, role }}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
