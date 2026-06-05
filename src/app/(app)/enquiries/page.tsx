import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getEnquiries } from '@/lib/queries/enquiries';
import type { UserRole } from '@/lib/types/profile';
import { EnquiriesClient } from './EnquiriesClient';

export default async function EnquiriesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) redirect('/login');

  const [enquiries, usersData] = await Promise.all([
    getEnquiries(),
    supabase.from('profiles').select('name, role').in('role', ['Admin', 'Sales', 'Accounts', 'Front Office']),
  ]);

  return (
    <EnquiriesClient
      initialEnquiries={enquiries}
      users={(usersData.data ?? []) as Array<{ name: string; role: string }>}
      currentUser={{ id: user.id, name: profile.name as string, role: profile.role as UserRole }}
    />
  );
}
