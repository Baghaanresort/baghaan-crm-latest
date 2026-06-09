'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { markCorporateLost } from '@/lib/actions/corporate';
import { CORPORATE_LOST_REASONS } from '@/lib/constants/corporate';
import type { Booking } from '@/lib/types/booking';

interface Props {
  booking: Booking;
  onClose: () => void;
}

export function CorporateLostModal({ booking, onClose }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    if (!reason) { toast.error('Please choose a reason.'); return; }
    startTransition(async () => {
      const res = await markCorporateLost(booking.id, reason, note);
      if (!res.success) { toast.error(res.error); return; }
      toast.success('Deal marked as lost');
      router.refresh();
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-stone-50 max-w-md w-full my-8" onClick={e => e.stopPropagation()}>
        <div className="bg-rose-800 text-white px-6 py-4 flex justify-between items-center">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider flex items-center gap-2">
              <Ban size={18} /> Mark Deal as Lost
            </h2>
            <p className="text-xs text-rose-100 mt-0.5">{booking.confirmationNumber} · {booking.companyName || booking.guestName}</p>
          </div>
          <button onClick={onClose} className="hover:bg-rose-700 p-1.5 rounded" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-stone-600">
            This cancels the booking and frees up any held rooms. The record is kept (never deleted) and the reason is saved to the activity log.
          </p>

          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">Reason <span className="text-rose-600">*</span></label>
            <select value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm bg-white outline-none focus:border-emerald-700">
              <option value="">Select a reason…</option>
              {CORPORATE_LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-stone-500 mb-1.5">Note <span className="text-stone-400 normal-case">(optional)</span></label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Any extra detail…" className="w-full px-3 py-2 border border-stone-300 text-sm bg-white outline-none focus:border-emerald-700 resize-none" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-stone-300 text-stone-600 hover:bg-stone-100">Cancel</button>
            <button onClick={submit} disabled={isPending || !reason} className="px-4 py-2 text-sm bg-rose-700 text-white hover:bg-rose-800 disabled:opacity-40 flex items-center gap-1.5">
              <Ban size={14} /> Mark as Lost
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
