'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, History } from 'lucide-react';
import { toast } from 'sonner';
import { getCorporateActivity, setCorporateStage } from '@/lib/actions/corporate';
import { CORPORATE_STAGES, CORPORATE_STAGE_ORDER } from '@/lib/constants/corporate';
import { fmtDateTime } from '@/lib/utils/date';
import type { Booking, CorporateStage } from '@/lib/types/booking';
import type { CorporateActivityEntry } from '@/lib/types/corporate-activity';

interface Props {
  booking: Booking;
  isAdmin: boolean;
  onClose: () => void;
}

// Colour accent per activity type, so the timeline is scannable.
function dotColor(type: string): string {
  if (type === 'confirmed' || type === 'completed') return 'bg-emerald-600';
  if (type === 'payment_verified') return 'bg-teal-600';
  if (type === 'pi_generated') return 'bg-amber-600';
  if (type === 'quote_sent' || type === 'quote_accepted') return 'bg-blue-600';
  if (type === 'stage_override') return 'bg-red-600';
  if (type === 'lost') return 'bg-rose-600';
  if (type === 'checked_in') return 'bg-emerald-700';
  return 'bg-stone-400';
}

export function CorporateActivityModal({ booking, isAdmin, onClose }: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState<CorporateActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overrideStage, setOverrideStage] = useState<CorporateStage>((booking.corporateStage ?? 'inquiry') as CorporateStage);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    getCorporateActivity(booking.id).then(res => {
      if (!active) return;
      if (res.success) setEntries(res.data); else setError(res.error);
    });
    return () => { active = false; };
  }, [booking.id]);

  const applyOverride = () => {
    startTransition(async () => {
      const res = await setCorporateStage(booking.id, overrideStage);
      if (!res.success) { toast.error(res.error); return; }
      toast.success(`Stage set to ${CORPORATE_STAGES[overrideStage].label}`);
      router.refresh();
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-stone-50 max-w-2xl w-full my-8" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-emerald-900 text-white px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider flex items-center gap-2">
              <History size={18} /> Activity Log
            </h2>
            <p className="text-xs text-stone-300 mt-0.5">{booking.confirmationNumber} · {booking.companyName || booking.guestName}</p>
          </div>
          <button onClick={onClose} className="hover:bg-emerald-800 p-1.5 rounded" aria-label="Close"><X size={18} /></button>
        </div>

        {/* Admin override */}
        {isAdmin && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center gap-3">
            <span className="text-xs uppercase tracking-wider text-red-800 font-semibold">Admin override</span>
            <select value={overrideStage} onChange={e => setOverrideStage(e.target.value as CorporateStage)} className="px-2 py-1.5 border border-stone-300 text-sm bg-white">
              {CORPORATE_STAGE_ORDER.map(s => <option key={s} value={s}>{CORPORATE_STAGES[s].label}</option>)}
            </select>
            <button onClick={applyOverride} disabled={isPending || overrideStage === booking.corporateStage} className="text-xs bg-red-700 text-white px-3 py-1.5 hover:bg-red-800 disabled:opacity-40">
              Set stage
            </button>
          </div>
        )}

        <div className="p-6 overflow-y-auto max-h-[68vh]">
          {error ? (
            <div className="text-sm text-red-600 italic text-center py-10">{error}</div>
          ) : entries === null ? (
            <div className="text-sm text-stone-400 italic text-center py-10">Loading activity…</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-stone-400 italic text-center py-10">No activity recorded yet.</div>
          ) : (
            <ol className="relative border-l-2 border-stone-200 ml-2">
              {entries.map(e => (
                <li key={e.id} className="ml-5 pb-5 last:pb-0">
                  <span className={`absolute -left-[7px] mt-1 w-3 h-3 rounded-full ${dotColor(e.type)} ring-2 ring-stone-50`} />
                  <div className="text-sm text-stone-800">{e.message}</div>
                  <div className="text-xs text-stone-400 mt-0.5">{fmtDateTime(e.createdAt)} · {e.actor}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
