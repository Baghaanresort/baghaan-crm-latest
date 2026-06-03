import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data } = await supabase.from('enquiries').select('*').order('created_at', { ascending: false });
  const rows = (data ?? []).map((row) => [
    row['enquiry_number'], row['date'], row['name'] ?? '', row['phone'] ?? '',
    row['email'] ?? '', row['source'] ?? '', row['enquiry_type'] ?? '',
    row['number_of_rooms'] ?? '', row['preferred_dates'] ?? '',
    row['status'], row['next_action'] ?? '', row['followup_date'] ?? '',
    row['notes'] ?? '', row['created_by'], row['created_at'],
    row['lost_reason'] ?? '',
  ]);

  const headers = ['#', 'Date', 'Name', 'Phone', 'Email', 'Source', 'Type', 'Rooms', 'Preferred Dates', 'Status', 'Next Action', 'Follow-up Date', 'Notes', 'Agent', 'Created At', 'Lost Reason'];
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="enquiries-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
