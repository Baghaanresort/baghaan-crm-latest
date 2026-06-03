import { createClient } from '@/lib/supabase/server';
import { SettingsClient } from './SettingsClient';

export default async function AdminSettingsPage() {
  const supabase = await createClient();

  const [metaRes, maintenanceRes] = await Promise.all([
    supabase.from('meta').select('key, value'),
    supabase.from('maintenance_blocks').select('*').order('date_from', { ascending: true }),
  ]);

  const meta = Object.fromEntries(
    ((metaRes.data ?? []) as Array<{ key: string; value: string }>).map(r => [r.key, r.value])
  );

  const maintenanceBlocks = (maintenanceRes.data ?? []).map(row => ({
    id: row['id'] as string,
    roomName: row['room_name'] as string,
    dateFrom: row['date_from'] as string,
    dateTo: row['date_to'] as string,
    reason: row['reason'] as string,
    createdBy: row['created_by'] as string,
    createdAt: row['created_at'] as string,
  }));

  return (
    <SettingsClient
      bookingCounter={parseInt((meta['booking_counter'] ?? '696'))}
      piCounter={parseInt((meta['pi_counter'] ?? '1038'))}
      enquiryCounter={parseInt((meta['enquiry_counter'] ?? '0'))}
      maintenanceBlocks={maintenanceBlocks}
    />
  );
}
