import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import { DEFAULT_TAB_BY_ROLE } from '@/lib/constants/roles';
import type { CurrentUser } from '@/context/UserContext';
import type { UserRole } from '@/lib/types/profile';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');

  const currentUser: CurrentUser = {
    id: user.id,
    email: user.email ?? '',
    name: profile.name as string,
    role: profile.role as UserRole,
  };

  return <AppShell user={currentUser}>{children}</AppShell>;
}
