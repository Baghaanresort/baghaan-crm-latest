'use server';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function datesOverlap(arr1: string, dep1: string, arr2: string, dep2: string): boolean {
  return arr1 < dep2 && dep1 > arr2;
}

function roomsOverlap(rooms1: string[], rooms2: string[]): string[] {
  return rooms1.filter(r => rooms2.includes(r));
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile['role'] !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, confirmation_number, guest_name, arrival, departure, rooms, status, created_at')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });

  if (error || !bookings) return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });

  const conflicts: Array<{
    keep: { id: string; conf: string; guest: string; arrival: string; departure: string };
    remove: { id: string; conf: string; guest: string; arrival: string; departure: string };
    clashingRooms: string[];
  }> = [];

  const toRemove = new Set<string>();

  for (let i = 0; i < bookings.length; i++) {
    for (let j = i + 1; j < bookings.length; j++) {
      const b1 = bookings[i]!;
      const b2 = bookings[j]!;
      if (toRemove.has(b1['id']) || toRemove.has(b2['id'])) continue;

      const clashingRooms = roomsOverlap(b1['rooms'] ?? [], b2['rooms'] ?? []);
      if (clashingRooms.length === 0) continue;
      if (!datesOverlap(b1['arrival'], b1['departure'], b2['arrival'], b2['departure'])) continue;

      // b1 is earlier (sorted by created_at), keep b1, remove b2
      toRemove.add(b2['id']);
      conflicts.push({
        keep: { id: b1['id'], conf: b1['confirmation_number'], guest: b1['guest_name'], arrival: b1['arrival'], departure: b1['departure'] },
        remove: { id: b2['id'], conf: b2['confirmation_number'], guest: b2['guest_name'], arrival: b2['arrival'], departure: b2['departure'] },
        clashingRooms,
      });
    }
  }

  return NextResponse.json({ total: conflicts.length, conflicts });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile['role'] !== 'Admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, confirmation_number, guest_name, arrival, departure, rooms, status, created_at')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });

  if (error || !bookings) return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });

  const toRemove = new Set<string>();

  for (let i = 0; i < bookings.length; i++) {
    for (let j = i + 1; j < bookings.length; j++) {
      const b1 = bookings[i]!;
      const b2 = bookings[j]!;
      if (toRemove.has(b1['id']) || toRemove.has(b2['id'])) continue;

      const clashingRooms = roomsOverlap(b1['rooms'] ?? [], b2['rooms'] ?? []);
      if (clashingRooms.length === 0) continue;
      if (!datesOverlap(b1['arrival'], b1['departure'], b2['arrival'], b2['departure'])) continue;

      toRemove.add(b2['id']);
    }
  }

  if (toRemove.size === 0) return NextResponse.json({ message: 'No conflicts found. Database is clean.', removed: 0 });

  const { error: delErr } = await supabase
    .from('bookings')
    .delete()
    .in('id', Array.from(toRemove));

  if (delErr) return NextResponse.json({ error: 'Failed to delete conflicting bookings' }, { status: 500 });

  return NextResponse.json({ message: `Fixed ${toRemove.size} conflicting booking(s).`, removed: toRemove.size });
}
