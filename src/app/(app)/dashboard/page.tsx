import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getDashboardData } from '@/lib/queries/dashboard';
import { DEFAULT_TAB_BY_ROLE } from '@/lib/constants/roles';
import type { UserRole } from '@/lib/types/profile';
import { DashboardClient } from './DashboardClient';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single();
  if (!profile) redirect('/login');

  const role = profile.role as UserRole;
  const defaultTab = DEFAULT_TAB_BY_ROLE[role];
  if (defaultTab && defaultTab !== 'dashboard') redirect(`/${defaultTab}`);

  const data = await getDashboardData();

  return (
    <DashboardClient
      bookings={data.bookings}
      payments={data.payments}
      users={data.users}
      currentUser={{ id: user.id, name: profile.name as string, role }}
      today={data.today}
    />
  );
}
