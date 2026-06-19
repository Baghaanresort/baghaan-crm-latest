import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { reconcileOpenLinks } from '@/lib/server/transactionEngine';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  // Reject when CRON_SECRET is unset/empty so a literal `Bearer undefined`/`Bearer ` can't slip through.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) return new Response('unauthorized', { status: 401 });

  const admin = createAdminClient();
  const result = await reconcileOpenLinks(admin);
  return Response.json(result);
}
