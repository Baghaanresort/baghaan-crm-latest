'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { InviteUserSchema, UpdateRoleSchema, UpdateCounterSchema } from '@/lib/validations/admin';
import type { UserRole } from '@/lib/types/profile';
import { z } from 'zod';

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'Admin') return null;
  return { id: user.id, name: profile.name as string, role: 'Admin' as const };
}

// ---------- inviteUser ----------

export async function inviteUser(
  input: z.infer<typeof InviteUserSchema>
): Promise<ActionResult<{ userId: string }>> {
  const parsed = InviteUserSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return err('Not authorized — Admin only');

  const admin = createAdminClient();

  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email,
    {
      data: { name: parsed.data.name, role: parsed.data.role },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
    }
  );

  if (inviteErr) {
    console.error('[inviteUser]', inviteErr);
    return err(inviteErr.message);
  }

  const { error: profileErr } = await admin
    .from('profiles')
    .insert({ id: invited.user.id, name: parsed.data.name, role: parsed.data.role });

  if (profileErr) {
    console.error('[inviteUser profile]', profileErr);
    return err('User invited but profile creation failed. Contact support.');
  }

  revalidatePath('/admin/users');
  return ok({ userId: invited.user.id });
}

// ---------- updateUserRole ----------

export async function updateUserRole(
  input: z.infer<typeof UpdateRoleSchema>
): Promise<ActionResult> {
  const parsed = UpdateRoleSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return err('Not authorized — Admin only');

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.userId);

  if (error) {
    console.error('[updateUserRole]', error);
    return err('Failed to update role.');
  }

  revalidatePath('/admin/users');
  return ok(undefined);
}

// ---------- deactivateUser ----------

export async function deactivateUser(userId: string): Promise<ActionResult> {
  if (!userId) return err('User ID required');

  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return err('Not authorized — Admin only');

  // Prevent self-deactivation
  const { data: { user: self } } = await supabase.auth.getUser();
  if (self?.id === userId) return err('You cannot deactivate your own account');

  const admin = createAdminClient();
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) {
    console.error('[deactivateUser auth]', authErr);
    return err(authErr.message);
  }

  await admin.from('profiles').delete().eq('id', userId);

  revalidatePath('/admin/users');
  return ok(undefined);
}

// ---------- updateCounter ----------

export async function updateCounter(
  input: z.infer<typeof UpdateCounterSchema>
): Promise<ActionResult> {
  const parsed = UpdateCounterSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return err('Not authorized — Admin only');

  const { error } = await supabase.from('meta').upsert({
    key: parsed.data.key,
    value: String(parsed.data.value),
  });

  if (error) {
    console.error('[updateCounter]', error);
    return err('Failed to update counter.');
  }

  revalidatePath('/admin/settings');
  return ok(undefined);
}

// ---------- getAdminUsers ----------

export async function getAdminUsers(): Promise<
  ActionResult<Array<{ id: string; name: string; role: UserRole; email: string; suspended: boolean; lastSignIn: string | null }>>
> {
  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return err('Not authorized — Admin only');

  const admin = createAdminClient();
  const { data: authUsers, error: authErr } = await admin.auth.admin.listUsers();
  if (authErr) return err(authErr.message);

  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('id, name, role')
    .order('name');

  if (profErr) return err('Failed to load users');

  const authMap = new Map(authUsers.users.map((u) => [u.id, u]));

  const users = (profiles ?? []).map((p) => {
    const au = authMap.get(p.id as string);
    const isSuspended = au?.banned_until ? new Date(au.banned_until) > new Date() : false;
    return {
      id: p.id as string,
      name: p.name as string,
      role: p.role as UserRole,
      email: au?.email ?? '',
      suspended: isSuspended,
      lastSignIn: au?.last_sign_in_at ?? null,
    };
  });

  return ok(users);
}

// ---------- suspendUser ----------

export async function suspendUser(userId: string): Promise<ActionResult> {
  if (!userId) return err('User ID required');
  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return err('Not authorized — Admin only');
  const { data: { user: self } } = await supabase.auth.getUser();
  if (self?.id === userId) return err('You cannot suspend your own account');

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
  if (error) { console.error('[suspendUser]', error); return err(error.message); }
  revalidatePath('/admin/users');
  return ok(undefined);
}

// ---------- resumeUser ----------

export async function resumeUser(userId: string): Promise<ActionResult> {
  if (!userId) return err('User ID required');
  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return err('Not authorized — Admin only');

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  if (error) { console.error('[resumeUser]', error); return err(error.message); }
  revalidatePath('/admin/users');
  return ok(undefined);
}

// ---------- sendPasswordReset ----------

export async function sendPasswordReset(email: string): Promise<ActionResult> {
  if (!email) return err('Email required');
  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return err('Not authorized — Admin only');

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/reset-password`,
  });
  if (error) { console.error('[sendPasswordReset]', error); return err(error.message); }
  return ok(undefined);
}

// ---------- forceLogoutUser ----------

export async function forceLogoutUser(userId: string): Promise<ActionResult> {
  if (!userId) return err('User ID required');
  const supabase = await createClient();
  const actor = await requireAdmin(supabase);
  if (!actor) return err('Not authorized — Admin only');
  const { data: { user: self } } = await supabase.auth.getUser();
  if (self?.id === userId) return err('You cannot force logout your own account');

  const admin = createAdminClient();
  // Temporarily ban then immediately unban — this invalidates all existing JWTs
  const { error: banErr } = await admin.auth.admin.updateUserById(userId, { ban_duration: '1s' });
  if (banErr) { console.error('[forceLogoutUser]', banErr); return err(banErr.message); }
  revalidatePath('/admin/users');
  return ok(undefined);
}
