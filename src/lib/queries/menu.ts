import { createClient } from '@/lib/supabase/server';
import { dbToMenuItem } from '@/lib/mappers/menu';
import type { MenuItem } from '@/lib/types/menu';

// All menu items (active + archived), ordered by category then sort order.
// Clients/print filter to active as needed.
export async function getMenuItems(): Promise<MenuItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('menu_items')
    .select('*')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  return (data ?? []).map(dbToMenuItem);
}
