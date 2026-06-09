import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getMenuItems } from '@/lib/queries/menu';
import type { UserRole } from '@/lib/types/profile';
import { MenuClient } from './MenuClient';

export default async function MenuPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) redirect('/login');

  const items = await getMenuItems();

  return (
    <MenuClient
      initialItems={items}
      currentUser={{ id: user.id, name: profile.name as string, role: profile.role as UserRole }}
    />
  );
}
