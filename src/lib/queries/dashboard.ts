import { createClient } from '@/lib/supabase/server';
import { dbToBooking } from '@/lib/mappers/booking';
import { dbToPayment } from '@/lib/mappers/payment';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';

export interface DashboardData {
  bookings: Booking[];
  payments: Payment[];
  today: string;
  users: Array<{ name: string; role: string }>;
  meta: {
    bookingCounter: number;
    piCounter: number;
    enquiryCounter: number;
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // All 4 queries fire in parallel — no waterfalls
  const [bookingsRes, paymentsRes, usersRes, metaRes] = await Promise.all([
    supabase.from('bookings').select('*').order('created_at', { ascending: false }),
    supabase.from('payments').select('*').order('recorded_at', { ascending: false }),
    supabase.from('profiles').select('name, role'),
    supabase.from('meta').select('key, value'),
  ]);

  const metaMap = Object.fromEntries(
    ((metaRes.data ?? []) as Array<{ key: string; value: string }>).map(r => [r.key, r.value])
  );

  return {
    bookings: (bookingsRes.data ?? []).map(dbToBooking),
    payments: (paymentsRes.data ?? []).map(dbToPayment),
    today,
    users: (usersRes.data ?? []) as Array<{ name: string; role: string }>,
    meta: {
      bookingCounter: metaMap['booking_counter'] ? parseInt(metaMap['booking_counter']!) : 696,
      piCounter: metaMap['pi_counter'] ? parseInt(metaMap['pi_counter']!) : 1038,
      enquiryCounter: metaMap['enquiry_counter'] ? parseInt(metaMap['enquiry_counter']!) : 0,
    },
  };
}
