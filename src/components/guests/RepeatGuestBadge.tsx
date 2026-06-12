'use client';

import { useEffect, useState } from 'react';
import { findGuestByPhone } from '@/lib/actions/guests';
import type { GuestWithStats } from '@/lib/actions/guests';

interface Props {
  phone: string;
  onGuestFound?: (guest: GuestWithStats) => void;
}

export function RepeatGuestBadge({ phone, onGuestFound }: Props) {
  const [guest, setGuest] = useState<GuestWithStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!phone || phone.length < 7) return;
    const t = setTimeout(async () => {
      setLoading(true);
      const result = await findGuestByPhone(phone);
      setLoading(false);
      if (result.success && result.data) {
        setGuest(result.data);
        onGuestFound?.(result.data);
      } else {
        setGuest(null);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [phone]);

  if (!phone || phone.length < 7) return null;
  if (loading) return <div className="text-xs text-stone-400 italic py-1">Checking guest profile…</div>;
  if (!guest) return null;

  return (
    <div className="bg-emerald-50 border border-emerald-300 px-3 py-2 text-xs text-emerald-800 flex items-center justify-between">
      <span>
        ↩ <strong>Returning guest</strong> — {guest.totalStays} previous {guest.totalStays === 1 ? 'stay' : 'stays'}
        {guest.totalSpend > 0 && ` · ₹${guest.totalSpend.toLocaleString('en-IN')} total spend`}
        {guest.lastStayDate && ` · Last stay: ${guest.lastStayDate}`}
      </span>
      <a href={`/guests/${guest.id}`} target="_blank" rel="noopener noreferrer" className="ml-3 underline hover:text-emerald-900 whitespace-nowrap">
        View profile →
      </a>
    </div>
  );
}
