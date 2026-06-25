'use client';

import { useState } from 'react';
import { X, Search } from 'lucide-react';
import type { Booking } from '@/lib/types/booking';
import { computeAvailability, type MaintenanceLike } from '@/lib/utils/availability';
import { fmtDate } from '@/lib/utils/date';

interface Props {
  bookings: Booking[];
  maintenanceBlocks: MaintenanceLike[];
  onClose: () => void;
}

// Local YYYY-MM-DD (avoids UTC off-by-one in +UTC zones — matches CalendarClient).
function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.round(ms / 86400000);
}

// Add days to a YYYY-MM-DD string (parsed as local, so no UTC off-by-one).
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function RoomAvailabilityModal({ bookings, maintenanceBlocks, onClose }: Props) {
  // Lazy initializers — Date is impure; keep it out of render (React Compiler).
  const [checkIn, setCheckIn] = useState(() => localDate(0));
  const [checkOut, setCheckOut] = useState(() => localDate(1));

  const valid = checkIn < checkOut;
  const rows = valid ? computeAvailability(bookings, maintenanceBlocks, checkIn, checkOut) : [];
  const nights = valid ? nightsBetween(checkIn, checkOut) : 0;
  const totalFree = rows.reduce((s, r) => s + r.free, 0);

  const freeColor = (free: number) =>
    free === 0 ? 'text-red-600' : free <= 2 ? 'text-amber-600' : 'text-emerald-700';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 bg-emerald-900 text-amber-50">
          <h2 className="flex items-center gap-2 text-lg" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
            <Search size={16} /> Room Availability
          </h2>
          <button onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-end gap-3">
            <label className="flex-1 text-xs text-stone-600">Check-in
              {/* No `max`: any check-in is selectable. Picking one on/after the current
                  check-out auto-advances check-out to the next day, so selection never dead-ends. */}
              <input type="date" lang="en-IN" value={checkIn}
                onChange={(e) => { const v = e.target.value; if (!v) return; setCheckIn(v); if (v >= checkOut) setCheckOut(addDays(v, 1)); }}
                className="mt-1 w-full border border-stone-300 px-2 py-1.5 text-sm outline-none focus:border-emerald-700" />
            </label>
            <label className="flex-1 text-xs text-stone-600">Check-out
              <input type="date" lang="en-IN" value={checkOut} min={addDays(checkIn, 1)}
                onChange={(e) => { if (e.target.value) setCheckOut(e.target.value); }}
                className="mt-1 w-full border border-stone-300 px-2 py-1.5 text-sm outline-none focus:border-emerald-700" />
            </label>
          </div>

          <p className="text-sm text-stone-700">
            {fmtDate(checkIn)} <span className="text-stone-400">→</span> {fmtDate(checkOut)}
            {valid && <span className="text-stone-500"> · {nights} night{nights === 1 ? '' : 's'}</span>}
          </p>

          {!valid ? (
            <p className="text-sm text-red-600">Check-out must be after check-in.</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.category} className="border-b border-stone-100">
                      <td className="py-2 font-medium text-stone-800">{r.category}</td>
                      <td className="py-2 text-right tabular-nums">
                        <span className={`font-semibold ${freeColor(r.free)}`}>{r.free} free</span>
                        {r.onHold > 0 && <span className="text-amber-600"> ({r.onHold} on hold)</span>}
                        <span className="text-stone-400"> /{r.total}</span>
                      </td>
                      <td className="py-2 pl-4 text-right text-stone-500 whitespace-nowrap">{inr(r.rate)}/night</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between text-sm pt-1">
                <span className="text-stone-500">Total rooms free</span>
                <span className={`font-semibold ${freeColor(totalFree)}`}>{totalFree} / 54</span>
              </div>
              <p className="text-xs text-stone-400 italic">Counts reflect rooms assigned for the selected dates.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
