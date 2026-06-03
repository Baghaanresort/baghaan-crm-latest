'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { AddActivitySchema } from '@/lib/validations/enquiry';
import type { EnquiryActivity } from '@/lib/types/enquiry';
import { z } from 'zod';

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

// ---------- addEnquiryActivity ----------

export async function addEnquiryActivity(
  input: z.infer<typeof AddActivitySchema>
): Promise<ActionResult<EnquiryActivity>> {
  const parsed = AddActivitySchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Admin'].includes(actor.role)) {
    return err('Only Sales and Admin can log activities');
  }

  const id = `ACT-${Date.now()}`;
  const now = new Date().toISOString();

  const activity: EnquiryActivity = {
    id,
    enquiryId: parsed.data.enquiryId,
    type: parsed.data.type,
    note: parsed.data.note,
    createdBy: actor.name,
    createdAt: now,
  };

  const { error } = await supabase.from('enquiry_activities').insert({
    id: activity.id,
    enquiry_id: activity.enquiryId,
    type: activity.type,
    note: activity.note,
    created_by: activity.createdBy,
    created_at: activity.createdAt,
  });

  if (error) {
    console.error('[addEnquiryActivity]', error);
    return err('Failed to log activity.');
  }

  revalidatePath('/enquiries');
  return ok(activity);
}

// ---------- getEnquiryActivities ----------

export async function getEnquiryActivities(
  enquiryId: string
): Promise<ActionResult<EnquiryActivity[]>> {
  if (!enquiryId) return err('Enquiry ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');

  const { data, error } = await supabase
    .from('enquiry_activities')
    .select('*')
    .eq('enquiry_id', enquiryId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getEnquiryActivities]', error);
    return err('Failed to load activities.');
  }

  const activities: EnquiryActivity[] = (data ?? []).map((row) => ({
    id: row['id'] as string,
    enquiryId: row['enquiry_id'] as string,
    type: row['type'] as EnquiryActivity['type'],
    note: row['note'] as string,
    createdBy: row['created_by'] as string,
    createdAt: row['created_at'] as string,
  }));

  return ok(activities);
}
