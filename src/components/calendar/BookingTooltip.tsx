'use client';

import type { Booking } from '@/lib/types/booking';
import { fmtDate } from '@/lib/utils/date';

interface MaintenanceBlock {
  id: string;
  roomName: string;
  dateFrom: string;
  dateTo: string;
  reason: string;
}

interface TooltipBooking {
  type: 'booking';
  booking: Booking;
}

interface TooltipMaintenance {
  type: 'maintenance';
  block: MaintenanceBlock;
}

export type TooltipData = TooltipBooking | TooltipMaintenance;

interface Props {
  data: TooltipData;
  x: number;
  y: number;
}

export function BookingTooltip({ data, x, y }: Props) {
  const style: React.CSSProperties = {
    position: 'fixed',
    left: x + 12,
    top: y - 8,
    zIndex: 9999,
    pointerEvents: 'none',
    maxWidth: 280,
  };

  // Clamp to viewport
  if (typeof window !== 'undefined') {
    if (x + 292 > window.innerWidth) {
      style.left = x - 292;
    }
  }

  if (data.type === 'maintenance') {
    const { block } = data;
    return (
      <div style={style} className="bg-white border border-red-200 rounded-xl shadow-2xl p-4 text-xs">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-block w-3 h-3 rounded-full bg-red-500" />
          <span className="font-semibold text-red-700 uppercase tracking-wide text-[10px]">Maintenance Block</span>
        </div>
        <p className="font-semibold text-stone-800 text-sm mb-1">{block.roomName}</p>
        <div className="text-stone-500 space-y-0.5">
          <p>{fmtDate(block.dateFrom)} → {fmtDate(block.dateTo)}</p>
          {block.reason && <p className="italic">{block.reason}</p>}
        </div>
      </div>
    );
  }

  const { booking } = data;
  const statusColor =
    booking.status === 'hold' ? 'text-amber-700' :
    booking.status === 'confirmed' ? 'text-emerald-700' :
    booking.status === 'checked_in' ? 'text-blue-700' :
    'text-stone-600';

  const statusBg =
    booking.status === 'hold' ? 'bg-amber-50 border-amber-200' :
    booking.status === 'confirmed' ? 'bg-emerald-50 border-emerald-200' :
    booking.status === 'checked_in' ? 'bg-blue-50 border-blue-200' :
    'bg-stone-50 border-stone-200';

  const statusLabel =
    booking.status === 'hold' ? 'On Hold' :
    booking.status === 'confirmed' ? 'Confirmed' :
    booking.status === 'checked_in' ? 'Checked In' :
    booking.status === 'checked_out' ? 'Checked Out' :
    booking.status;

  return (
    <div style={style} className={`bg-white border rounded-xl shadow-2xl p-4 text-xs ${statusBg}`}>
      <div className="flex items-center justify-between gap-4 mb-2">
        <span className={`font-semibold text-sm ${statusColor}`}>{booking.guestName}</span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${
          booking.status === 'hold' ? 'bg-amber-100 text-amber-700' :
          booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
          booking.status === 'checked_in' ? 'bg-blue-100 text-blue-700' :
          'bg-stone-100 text-stone-600'
        }`}>{statusLabel}</span>
      </div>
      <p className="text-stone-400 text-[10px] font-mono mb-2">{booking.confirmationNumber}</p>
      <div className="text-stone-600 space-y-1">
        <div className="flex gap-1">
          <span className="text-stone-400 w-16 shrink-0">Check-in</span>
          <span className="font-medium">{fmtDate(booking.arrival)}</span>
        </div>
        <div className="flex gap-1">
          <span className="text-stone-400 w-16 shrink-0">Check-out</span>
          <span className="font-medium">{fmtDate(booking.departure)}</span>
        </div>
        <div className="flex gap-1">
          <span className="text-stone-400 w-16 shrink-0">Nights</span>
          <span className="font-medium">{booking.nights}</span>
        </div>
        <div className="flex gap-1">
          <span className="text-stone-400 w-16 shrink-0">Guests</span>
          <span className="font-medium">{booking.adults} adults{booking.children > 0 ? `, ${booking.children} children` : ''}</span>
        </div>
        {booking.rooms.length > 0 && (
          <div className="flex gap-1">
            <span className="text-stone-400 w-16 shrink-0">Rooms</span>
            <span className="font-medium">{booking.rooms.length}</span>
          </div>
        )}
        {booking.totalAmount > 0 && (
          <div className="flex gap-1 pt-1 border-t border-stone-100">
            <span className="text-stone-400 w-16 shrink-0">Amount</span>
            <span className="font-semibold text-stone-800">₹{booking.totalAmount.toLocaleString('en-IN')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
