'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { MenuItemSchema, type MenuItemInput } from '@/lib/validations/menu';
import { menuItemToDb } from '@/lib/mappers/menu';

async function getAuthedUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) return null;
  return { id: user.id, name: profile.name as string, role: profile.role as string };
}

function canManageMenu(role: string): boolean {
  return role === 'Sales' || role === 'Admin';
}

export async function createMenuItem(input: MenuItemInput): Promise<ActionResult<{ id: string }>> {
  const parsed = MenuItemSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!canManageMenu(actor.role)) return err('Only Sales and Admin can edit the menu');

  const id = `MENU-${Date.now()}`;
  const now = new Date().toISOString();
  const { error } = await supabase.from('menu_items').insert(menuItemToDb({
    ...parsed.data,
    id,
    isActive: true,
    createdBy: actor.name,
    createdAt: now,
    updatedBy: actor.name,
    updatedAt: now,
  }));
  if (error) {
    console.error('[createMenuItem]', error);
    return err('Failed to add menu item.');
  }

  revalidatePath('/corporate/menu');
  return ok({ id });
}

export async function updateMenuItem(id: string, input: MenuItemInput): Promise<ActionResult> {
  if (!id) return err('Item ID required');
  const parsed = MenuItemSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!canManageMenu(actor.role)) return err('Only Sales and Admin can edit the menu');

  const { error } = await supabase.from('menu_items').update(menuItemToDb({
    ...parsed.data,
    updatedBy: actor.name,
    updatedAt: new Date().toISOString(),
  })).eq('id', id);
  if (error) {
    console.error('[updateMenuItem]', error);
    return err('Failed to update menu item.');
  }

  revalidatePath('/corporate/menu');
  return ok(undefined);
}

// Archive / restore — the record is never deleted, only hidden from the menu.
export async function setMenuItemActive(id: string, isActive: boolean): Promise<ActionResult> {
  if (!id) return err('Item ID required');
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!canManageMenu(actor.role)) return err('Only Sales and Admin can edit the menu');

  const { error } = await supabase.from('menu_items')
    .update(menuItemToDb({ isActive, updatedBy: actor.name, updatedAt: new Date().toISOString() }))
    .eq('id', id);
  if (error) {
    console.error('[setMenuItemActive]', error);
    return err('Failed to update menu item.');
  }

  revalidatePath('/corporate/menu');
  return ok(undefined);
}
