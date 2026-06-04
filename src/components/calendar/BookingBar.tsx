'use client';

import { House } from 'lucide-react';
import type { Booking } from '@/lib/types/booking';

interface MaintenanceBlock {
  id: string;
  roomName: string;
  dateFrom: string;
  dateTo: string;
  reason: string;
}

interface BookingBarProps {
  booking: Booking;
  leftPx: number;
  widthPx: number;
  rowHeight: number;
  onMouseEnter: (e: React.MouseEvent, booking: Booking) => void;
  onMouseLeave: () => void;
  onMouseMove: (e: React.MouseEvent) => void;
}

interface MaintenanceBarProps {
  block: MaintenanceBlock;
  leftPx: number;
  widthPx: number;
  rowHeight: number;
  onMouseEnter: (e: React.MouseEvent, block: MaintenanceBlock) => void;
  onMouseLeave: () => void;
  onMouseMove: (e: React.MouseEvent) => void;
}

function getBookingColor(status: Booking['status']): { bg: string; text: string; border: string } {
  switch (status) {
    case 'confirmed':
      return { bg: '#22C55E', text: '#ffffff', border: '#16A34A' };
    case 'hold':
      return { bg: '#FACC15', text: '#713f12', border: '#EAB308' };
    case 'checked_in':
      return { bg: '#60A5FA', text: '#1e3a5f', border: '#3B82F6' };
    case 'checked_out':
      return { bg: '#94A3B8', text: '#334155', border: '#64748B' };
    case 'cancelled':
      return { bg: '#FCA5A5', text: '#7f1d1d', border: '#EF4444' };
    default:
      return { bg: '#E5E7EB', text: '#374151', border: '#D1D5DB' };
  }
}

export function BookingBar({
  booking,
  leftPx,
  widthPx,
  rowHeight,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
}: BookingBarProps) {
  const colors = getBookingColor(booking.status);
  const barHeight = rowHeight - 8;
  const top = 4;

  return (
    <div
      style={{
        position: 'absolute',
        left: leftPx + 2,
        top,
        width: Math.max(widthPx - 4, 8),
        height: barHeight,
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'default',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 6,
        paddingRight: 4,
        zIndex: 2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      }}
      onMouseEnter={(e) => onMouseEnter(e, booking)}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
      title={`${booking.guestName} — ${booking.confirmationNumber}`}
    >
      {widthPx > 16 && (
        <House size={11} color={colors.text} strokeWidth={2} />
      )}
    </div>
  );
}

export function MaintenanceBar({
  block,
  leftPx,
  widthPx,
  rowHeight,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
}: MaintenanceBarProps) {
  const barHeight = rowHeight - 8;
  const top = 4;

  return (
    <div
      style={{
        position: 'absolute',
        left: leftPx + 2,
        top,
        width: Math.max(widthPx - 4, 8),
        height: barHeight,
        backgroundColor: '#FEE2E2',
        border: '1px dashed #EF4444',
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'default',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 6,
        paddingRight: 4,
        zIndex: 2,
        boxShadow: '0 1px 2px rgba(239,68,68,0.2)',
      }}
      onMouseEnter={(e) => onMouseEnter(e, block)}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
      title={`Maintenance: ${block.reason || 'No reason given'}`}
    >
      {widthPx > 24 && (
        <span
          style={{
            color: '#B91C1C',
            fontSize: 10,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            letterSpacing: '0.01em',
          }}
        >
          🔧 {block.reason || 'Maintenance'}
        </span>
      )}
    </div>
  );
}
