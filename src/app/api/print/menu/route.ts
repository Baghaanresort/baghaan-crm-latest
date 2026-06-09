import { createClient } from '@/lib/supabase/server';
import { getMenuItems } from '@/lib/queries/menu';
import { buildMenuHTML } from '@/lib/utils/menuPrint';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const items = await getMenuItems();
  const html = buildMenuHTML(items);

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-cache' },
  });
}
