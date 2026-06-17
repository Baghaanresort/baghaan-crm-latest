import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getBookingsForCalendar } from '@/lib/queries/bookings';
import { CalendarClient } from './CalendarClient';

export interface MaintenanceBlock {
  id: string;
  roomName: string;
  dateFrom: string;
  dateTo: string;
  reason: string;
}

export default async function CalendarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) redirect('/login');

  const [bookings, maintenanceRes] = await Promise.all([
    getBookingsForCalendar(),
    supabase
      .from('maintenance_blocks')
      .select('*')
      .order('date_from', { ascending: true }),
  ]);

  const maintenanceBlocks: MaintenanceBlock[] = (maintenanceRes.data ?? []).map(row => ({
    id: row['id'] as string,
    roomName: row['room_name'] as string,
    dateFrom: row['date_from'] as string,
    dateTo: row['date_to'] as string,
    reason: row['reason'] as string,
  }));

  return <CalendarClient initialBookings={bookings} maintenanceBlocks={maintenanceBlocks} />;
}
