'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ROOM_INVENTORY } from '@/lib/constants/rooms';
import { datesInRange, isoDate } from '@/lib/utils/date';
import type { Booking } from '@/lib/types/booking';

const ALL_ROOMS = Object.entries(ROOM_INVENTORY).flatMap(([cat, rooms]) => rooms.map(r => ({ room: r, cat })));

type CellStatus = 'confirmed' | 'hold' | 'pending' | 'today' | null;

function getCellStyle(status: CellStatus): string {
  if (status === 'confirmed') return 'bg-emerald-100 border-emerald-300 text-emerald-900';
  if (status === 'hold') return 'border-amber-300' + ' ' + 'bg-amber-50';
  if (status === 'pending') return 'border-purple-300 bg-purple-50';
  if (status === 'today') return 'bg-amber-200 border-amber-400';
  return '';
}

interface Props {
  initialBookings: Booking[];
}

export function CalendarClient({ initialBookings: bookings }: Props) {
  const today = isoDate(new Date());
  const [monthOffset, setMonthOffset] = useState(0);
  const [tooltipBooking, setTooltipBooking] = useState<Booking | null>(null);

  const { year, month, days, monthLabel } = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    const year = d.getFullYear();
    const month = d.getMonth();
    const last = new Date(year, month + 1, 0).getDate();
    return {
      year, month,
      days: Array.from({ length: last }, (_, i) => i + 1),
      monthLabel: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  }, [monthOffset]);

  // Build room -> date -> booking map
  const grid = useMemo(() => {
    const m: Record<string, Record<string, Booking>> = {};
    bookings.forEach(b => {
      const range = datesInRange(b.arrival, b.departure);
      range.forEach(d => {
        (b.rooms ?? []).forEach(r => {
          if (!m[r]) m[r] = {};
          m[r]![d] = b;
        });
      });
    });
    return m;
  }, [bookings]);

  const getStatus = (b: Booking | undefined): CellStatus => {
    if (!b) return null;
    const bookingPayments = [] as never[];
    if (b.status === 'hold') return 'hold';
    return 'confirmed';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Occupancy Calendar</h2>
          <p className="text-sm text-stone-500 italic">{monthLabel}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMonthOffset(m => m - 1)} className="p-2 border border-stone-300 hover:bg-stone-100 rounded"><ChevronLeft size={16} /></button>
          <button onClick={() => setMonthOffset(0)} className="px-3 py-2 border border-stone-300 hover:bg-stone-100 text-sm">Today</button>
          <button onClick={() => setMonthOffset(m => m + 1)} className="p-2 border border-stone-300 hover:bg-stone-100 rounded"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse" style={{ minWidth: `${140 + days.length * 28}px` }}>
          <thead>
            <tr className="bg-emerald-900 text-amber-100">
              <th className="sticky left-0 bg-emerald-900 text-left px-3 py-2 w-36 z-20">Room</th>
              {days.map(d => {
                const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const isToday = iso === today;
                return (
                  <th key={d} className={`text-center border-l border-emerald-800 w-7 py-2 ${isToday ? 'bg-amber-500 text-white' : ''}`}>
                    {d}
                  </th>
                );
              })}
              <th className="sticky right-0 bg-emerald-900 text-center px-2 py-2 z-10">Total</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(ROOM_INVENTORY).flatMap(([cat, rooms]) => [
              // Category header row
              <tr key={`cat-${cat}`} className="bg-stone-100">
                <td colSpan={days.length + 2} className="sticky left-0 px-3 py-1.5 font-medium text-emerald-900 uppercase tracking-wider bg-stone-100 z-10">
                  {cat}
                </td>
              </tr>,
              // Room rows
              ...rooms.map(room => {
                const roomGrid = grid[room] ?? {};
                const totalBooked = days.filter(d => {
                  const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  return !!roomGrid[iso];
                }).length;

                return (
                  <tr key={room} className="hover:bg-stone-50">
                    <td className="sticky left-0 bg-white border-b border-stone-100 px-3 py-1.5 text-stone-700 z-10 whitespace-nowrap">
                      {room.replace(/^.+ /, '') /* show number/name only */}
                      <span className="text-stone-400 text-xs ml-1">{room.includes('Khema') ? 'KK' : room.includes('Premium') ? 'POC' : room.includes('Orchard') ? 'OC' : 'K'}</span>
                    </td>
                    {days.map(d => {
                      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      const b = roomGrid[iso];
                      const isToday = iso === today;
                      let cellClass = `border-l border-stone-100 text-center cursor-default `;
                      if (b) {
                        if (b.status === 'hold') cellClass += 'bg-amber-50 border-amber-200';
                        else cellClass += 'bg-emerald-100 border-emerald-200';
                      } else if (isToday) {
                        cellClass += 'bg-amber-100';
                      }
                      return (
                        <td key={d} className={cellClass} title={b ? `${b.guestName} (${b.confirmationNumber})` : ''}>
                          {b ? (
                            <div className={`w-full h-full py-1 text-center ${b.status === 'hold' ? 'text-amber-700' : 'text-emerald-700'}`}>
                              ●
                            </div>
                          ) : isToday ? '·' : ''}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 bg-white border-l border-stone-200 text-center px-1 z-10 font-medium text-stone-700">
                      {totalBooked || ''}
                    </td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-6 text-xs text-stone-600 flex-wrap">
        <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 bg-emerald-100 border border-emerald-200" /><span>Confirmed</span></div>
        <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 bg-amber-50 border border-amber-300" /><span>On Hold</span></div>
        <div className="flex items-center gap-2"><span className="inline-block w-4 h-4 bg-amber-100 border border-amber-200" /><span>Today</span></div>
      </div>
    </div>
  );
}
