'use client';

import type { Booking } from '@/lib/types/booking';
import type { RoomCategory } from '@/lib/constants/rooms';
import { BookingBar, MaintenanceBar } from './BookingBar';
import { OccupancyHeatmap } from './OccupancyHeatmap';
import type { TooltipData } from './BookingTooltip';

interface MaintenanceBlock {
  id: string;
  roomName: string;
  dateFrom: string;
  dateTo: string;
  reason: string;
}

interface RoomRow {
  room: string;
  cat: RoomCategory;
  shortName: string;
  catBadge: string;
  catColor: string;
}

interface DayInfo {
  date: string;
  dayNum: number;
  dayAbbr: string;
  isToday: boolean;
  isWeekend: boolean;
}

interface DayOccupancy {
  date: string;
  dayNum: number;
  pct: number;
}

interface BookingSegment {
  booking: Booking;
  startIdx: number;
  nights: number;
}

interface MaintenanceSegment {
  block: MaintenanceBlock;
  startIdx: number;
  nights: number;
}

interface Props {
  rooms: RoomRow[];
  days: DayInfo[];
  dayOccupancy: DayOccupancy[];
  bookingsByRoom: Map<string, BookingSegment[]>;
  maintenanceByRoom: Map<string, MaintenanceSegment[]>;
  cellWidth: number;
  rowHeight: number;
  sidebarWidth: number;
  onTooltip: (data: TooltipData | null, x: number, y: number) => void;
}

const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  'KK':  { bg: '#dcfce7', text: '#166534' },
  'OC':  { bg: '#dbeafe', text: '#1e40af' },
  'POC': { bg: '#f3e8ff', text: '#6b21a8' },
  'K':   { bg: '#fef9c3', text: '#713f12' },
};

const HEATMAP_HEIGHT = 40;
const HEADER_HEIGHT = 44;

// One scroll container holds the heatmap, the day-number header, and the room
// rows. The first two are `position: sticky` (top: 0 / top: HEATMAP_HEIGHT) so
// they stay pinned while rooms scroll vertically, and — because everything lives
// in the SAME scroller — they share one horizontal scroll and can never drift out
// of alignment. (A previous design put the header outside the body's scroller, so
// the body's vertical scrollbar gave it independent horizontal scroll and the day
// labels drifted ~a cell away from the booking bars.)
export function CalendarGrid({
  rooms,
  days,
  dayOccupancy,
  bookingsByRoom,
  maintenanceByRoom,
  cellWidth,
  rowHeight,
  sidebarWidth,
  onTooltip,
}: Props) {
  const totalWidth = sidebarWidth + days.length * cellWidth;

  const handleBookingMouseEnter = (e: React.MouseEvent, booking: Booking) =>
    onTooltip({ type: 'booking', booking }, e.clientX, e.clientY);
  const handleMaintenanceMouseEnter = (e: React.MouseEvent, block: MaintenanceBlock) =>
    onTooltip({ type: 'maintenance', block }, e.clientX, e.clientY);
  const handleMouseLeave = () => onTooltip(null, 0, 0);
  const handleMouseMove = () => {};

  return (
    <div
      className="rounded-xl border border-stone-200"
      style={{ overflow: 'auto', maxHeight: 600, backgroundColor: '#F8F7F4' }}
    >
      <div style={{ minWidth: totalWidth, position: 'relative' }}>
        {/* Occupancy heatmap — sticky top row */}
        <div style={{ position: 'sticky', top: 0, zIndex: 25 }}>
          <OccupancyHeatmap days={dayOccupancy} cellWidth={cellWidth} sidebarWidth={sidebarWidth} />
        </div>

        {/* Day-number header — sticky just below the heatmap */}
        <div
          style={{
            position: 'sticky',
            top: HEATMAP_HEIGHT,
            zIndex: 20,
            display: 'flex',
            minWidth: totalWidth,
            backgroundColor: '#005C4B',
            borderBottom: '2px solid #004038',
          }}
        >
          {/* Corner cell */}
          <div
            style={{
              width: sidebarWidth,
              minWidth: sidebarWidth,
              position: 'sticky',
              left: 0,
              zIndex: 30,
              backgroundColor: '#005C4B',
              borderRight: '1px solid rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 12,
              paddingRight: 8,
              height: HEADER_HEIGHT,
            }}
          >
            <span className="text-xs font-semibold text-amber-200 uppercase tracking-widest">Room</span>
          </div>

          {/* Day headers */}
          {days.map((day) => (
            <div
              key={day.date}
              style={{
                width: cellWidth,
                minWidth: cellWidth,
                height: HEADER_HEIGHT,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: '1px solid rgba(255,255,255,0.08)',
                backgroundColor: day.isToday
                  ? 'rgba(52, 211, 153, 0.25)'
                  : day.isWeekend
                  ? 'rgba(251, 191, 36, 0.1)'
                  : 'transparent',
                borderBottom: day.isToday ? '3px solid #34d399' : '3px solid transparent',
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: day.isToday ? '#6ee7b7' : day.isWeekend ? '#fcd34d' : 'rgba(255,255,255,0.55)',
                  fontWeight: 500,
                  letterSpacing: '0.05em',
                  lineHeight: 1,
                }}
              >
                {day.dayAbbr}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: day.isToday ? '#ffffff' : day.isWeekend ? '#fde68a' : 'rgba(255,255,255,0.9)',
                  fontWeight: day.isToday ? 700 : 500,
                  lineHeight: 1.4,
                }}
              >
                {String(day.dayNum).padStart(2, '0')}
              </span>
            </div>
          ))}
        </div>

        {/* Room rows */}
        {rooms.map((roomRow, index) => {
          const bookingSegs = bookingsByRoom.get(roomRow.room) ?? [];
          const maintenanceSegs = maintenanceByRoom.get(roomRow.room) ?? [];
          const catColors = CAT_COLORS[roomRow.catBadge] ?? { bg: '#f3f4f6', text: '#374151' };
          const isEven = index % 2 === 0;
          const rowBg = isEven ? '#ffffff' : '#fafaf9';

          return (
            <div
              key={roomRow.room}
              style={{
                display: 'flex',
                minWidth: totalWidth,
                height: rowHeight,
                backgroundColor: rowBg,
                borderBottom: '1px solid #e7e5e4',
              }}
            >
              {/* Sticky room label */}
              <div
                style={{
                  width: sidebarWidth,
                  minWidth: sidebarWidth,
                  height: rowHeight,
                  position: 'sticky',
                  left: 0,
                  zIndex: 10,
                  backgroundColor: rowBg,
                  borderRight: '1px solid #e7e5e4',
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 12,
                  paddingRight: 8,
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#292524',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1,
                  }}
                >
                  {roomRow.shortName}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 4,
                    backgroundColor: catColors.bg,
                    color: catColors.text,
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {roomRow.catBadge}
                </span>
              </div>

              {/* Timeline — background cells + booking/maintenance bars */}
              <div style={{ position: 'relative', flex: 1, height: rowHeight, display: 'flex' }}>
                {days.map((day) => (
                  <div
                    key={day.date}
                    style={{
                      width: cellWidth,
                      minWidth: cellWidth,
                      height: rowHeight,
                      borderRight: '1px solid #f5f5f4',
                      backgroundColor: day.isToday
                        ? 'rgba(209, 250, 229, 0.4)'
                        : day.isWeekend
                        ? 'rgba(254, 243, 199, 0.35)'
                        : 'transparent',
                      flexShrink: 0,
                    }}
                  />
                ))}

                {bookingSegs.map((seg) => (
                  <BookingBar
                    key={`${seg.booking.id}-${seg.startIdx}`}
                    booking={seg.booking}
                    leftPx={seg.startIdx * cellWidth}
                    widthPx={seg.nights * cellWidth}
                    rowHeight={rowHeight}
                    onMouseEnter={handleBookingMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    onMouseMove={handleMouseMove}
                  />
                ))}

                {maintenanceSegs.map((seg) => (
                  <MaintenanceBar
                    key={`${seg.block.id}-${seg.startIdx}`}
                    block={seg.block}
                    leftPx={seg.startIdx * cellWidth}
                    widthPx={seg.nights * cellWidth}
                    rowHeight={rowHeight}
                    onMouseEnter={handleMaintenanceMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    onMouseMove={handleMouseMove}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
