import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Search } from 'lucide-react';
import Link from 'next/link';
import type { UserRole } from '@/lib/types/profile';
import { GuestDirectoryClient } from './GuestDirectoryClient';

export default async function GuestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) redirect('/login');

  const role = profile.role as UserRole;
  if (!['Sales', 'Front Office', 'Admin'].includes(role)) redirect('/dashboard');

  const { data: guestsRaw } = await supabase
    .from('guests')
    .select('id, name, phone, email, company_name, created_at')
    .order('created_at', { ascending: false });

  // Get stay counts per guest
  const { data: bookingsRaw } = await supabase
    .from('bookings')
    .select('guest_id, total_amount')
    .not('guest_id', 'is', null);

  const stayMap: Record<string, { count: number; revenue: number }> = {};
  (bookingsRaw ?? []).forEach(b => {
    const gid = b['guest_id'] as string;
    if (!stayMap[gid]) stayMap[gid] = { count: 0, revenue: 0 };
    stayMap[gid]!.count++;
    stayMap[gid]!.revenue += Number(b['total_amount'] ?? 0);
  });

  const guests = (guestsRaw ?? []).map(g => ({
    id: g['id'] as string,
    name: (g['name'] as string) || '(No name)',
    phone: g['phone'] as string,
    email: (g['email'] as string) || '',
    companyName: (g['company_name'] as string) || '',
    createdAt: g['created_at'] as string,
    totalStays: stayMap[g['id'] as string]?.count ?? 0,
    totalSpend: stayMap[g['id'] as string]?.revenue ?? 0,
  }));

  return <GuestDirectoryClient guests={guests} />;
}
