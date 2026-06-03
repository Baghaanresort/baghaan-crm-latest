import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data } = await supabase.from('payments').select('*').order('recorded_at', { ascending: false });
  const rows = (data ?? []).map((row) => [
    row['id'], row['booking_id'], row['payment_date'], row['amount'], row['mode'],
    row['reference'] ?? '', row['type'], row['verified'] ? 'Yes' : 'No',
    row['verified_by'] ?? '', row['verified_at'] ?? '',
    row['recorded_by'], row['recorded_by_role'], row['recorded_at'],
  ]);

  const headers = ['Payment ID', 'Booking ID', 'Date', 'Amount', 'Mode', 'Reference', 'Type', 'Verified', 'Verified By', 'Verified At', 'Recorded By', 'Role', 'Recorded At'];
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payments-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
