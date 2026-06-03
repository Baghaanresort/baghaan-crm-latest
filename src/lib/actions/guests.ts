'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import type { Guest } from '@/lib/types/guest';

async function getAuthedUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single();
  if (!profile) return null;
  return { id: user.id, name: profile.name as string, role: profile.role as string };
}

const GuestSchema = z.object({
  name: z.string().optional().default(''),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().optional().default(''),
  companyName: z.string().optional().default(''),
  gstNumber: z.string().optional().default(''),
  preferences: z.string().optional().default(''),
  internalNotes: z.string().optional().default(''),
});

// ---------- findGuestByPhone ----------

export interface GuestWithStats extends Omit<Guest, 'totalStays' | 'totalSpend' | 'lastStayDate'> {
  totalStays: number;
  totalSpend: number;
  lastStayDate: string | null;
}

export async function findGuestByPhone(
  phone: string
): Promise<ActionResult<GuestWithStats | null>> {
  if (!phone) return ok(null);

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');

  const { data: guest } = await supabase
    .from('guests')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (!guest) return ok(null);

  // Compute stay stats
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, arrival, departure, total_amount, status')
    .eq('guest_id', guest['id'])
    .neq('status', 'cancelled');

  const totalStays = bookings?.length ?? 0;
  const totalSpend = (bookings ?? []).reduce(
    (s, b) => s + Number(b['total_amount'] ?? 0), 0
  );
  const lastStayDate = (bookings ?? [])
    .map((b) => b['arrival'] as string)
    .sort()
    .reverse()[0] ?? null;

  return ok({
    id: guest['id'] as string,
    name: (guest['name'] as string) ?? '',
    phone: guest['phone'] as string,
    email: (guest['email'] as string) ?? '',
    companyName: (guest['company_name'] as string) ?? '',
    gstNumber: (guest['gst_number'] as string) ?? '',
    preferences: (guest['preferences'] as string) ?? '',
    internalNotes: (guest['internal_notes'] as string) ?? '',
    createdAt: guest['created_at'] as string,
    updatedAt: guest['updated_at'] as string,
    totalStays,
    totalSpend,
    lastStayDate,
  });
}

// ---------- updateGuest ----------

export async function updateGuest(
  guestId: string,
  input: z.infer<typeof GuestSchema>
): Promise<ActionResult> {
  if (!guestId) return err('Guest ID required');
  const parsed = GuestSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');

  const { error } = await supabase
    .from('guests')
    .update({
      name: parsed.data.name,
      email: parsed.data.email,
      company_name: parsed.data.companyName,
      gst_number: parsed.data.gstNumber,
      preferences: parsed.data.preferences,
      internal_notes: parsed.data.internalNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', guestId);

  if (error) {
    console.error('[updateGuest]', error);
    return err('Failed to update guest.');
  }

  revalidatePath('/guests');
  revalidatePath(`/guests/${guestId}`);
  return ok(undefined);
}
