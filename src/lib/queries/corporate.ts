import { createClient } from '@/lib/supabase/server';

// Latest activity-log entry per booking, for the "Last Activity" column on the
// corporate list. One small query; reduced to the newest row per booking_id.
export async function getLatestActivityByBooking(): Promise<Record<string, { message: string; createdAt: string }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('corporate_activity')
    .select('booking_id, message, created_at')
    .order('created_at', { ascending: false });

  const map: Record<string, { message: string; createdAt: string }> = {};
  for (const r of data ?? []) {
    const bid = r['booking_id'] as string;
    if (!map[bid]) map[bid] = { message: r['message'] as string, createdAt: r['created_at'] as string };
  }
  return map;
}
