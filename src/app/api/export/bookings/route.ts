import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data } = await supabase.from('bookings').select('*').order('created_at', { ascending: false });
  const rows = (data ?? []).map((row) => [
    row['confirmation_number'], row['guest_name'], row['contact_number'], row['email'] ?? '',
    row['company_name'] ?? '', row['arrival'], row['departure'], row['nights'],
    (row['rooms'] as string[] | null)?.length ?? 0, row['total_amount'], row['advance_paid'],
    row['status'], row['booking_type'], row['created_by'], row['created_at'],
  ]);

  const headers = ['Confirmation #', 'Guest Name', 'Contact', 'Email', 'Company', 'Arrival', 'Departure', 'Nights', 'Rooms', 'Total Amount', 'Advance Paid', 'Status', 'Type', 'Created By', 'Created At'];
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bookings-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
