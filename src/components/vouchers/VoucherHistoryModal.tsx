'use client';

import { useEffect, useState } from 'react';
import { X, History } from 'lucide-react';
import { fmtDateTime } from '@/lib/utils/date';
import { getVoucherHistory, type VoucherEditEntry } from '@/lib/actions/vouchers';
import type { Booking } from '@/lib/types/booking';

interface Props {
  booking: Booking;
  onClose: () => void;
}

// Humanise a camelCase field key, e.g. "contactNumber" → "Contact Number".
function fieldLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function VoucherHistoryModal({ booking, onClose }: Props) {
  const [entries, setEntries] = useState<VoucherEditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    getVoucherHistory(booking.id).then(res => {
      if (!active) return;
      if (res.success) setEntries(res.data);
      else setError(res.error);
    });
    return () => { active = false; };
  }, [booking.id]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-stone-50 max-w-2xl w-full my-8" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-emerald-900 text-white px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider flex items-center gap-2">
              <History size={18} /> Voucher Edit History
            </h2>
            <p className="text-xs text-stone-300 mt-0.5">{booking.confirmationNumber} · {booking.guestName}</p>
          </div>
          <button onClick={onClose} className="hover:bg-emerald-800 p-1.5 rounded" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[72vh]">
          {error ? (
            <div className="text-sm text-red-600 italic text-center py-10">{error}</div>
          ) : entries === null ? (
            <div className="text-sm text-stone-400 italic text-center py-10">Loading edit history…</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-stone-400 italic text-center py-10">No edits recorded for this voucher yet.</div>
          ) : (
            <div className="space-y-4">
              {entries.map(entry => (
                <div key={entry.id} className="bg-white border border-stone-200">
                  <div className="flex justify-between items-center px-4 py-2.5 border-b border-stone-100 bg-stone-50">
                    <span className="text-sm font-medium text-stone-800">{entry.changedBy}</span>
                    <span className="text-xs text-stone-500 font-mono">{fmtDateTime(entry.changedAt)}</span>
                  </div>
                  <div className="divide-y divide-stone-100">
                    {Object.entries(entry.changes).map(([field, diff]) => (
                      <div key={field} className="px-4 py-2 text-sm">
                        <span className="text-xs text-stone-500 uppercase tracking-wider">{fieldLabel(field)}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-red-700 line-through bg-red-50 px-1.5 py-0.5 text-xs">{fmtValue(diff.from)}</span>
                          <span className="text-stone-400">→</span>
                          <span className="text-emerald-800 bg-emerald-50 px-1.5 py-0.5 text-xs">{fmtValue(diff.to)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
