'use client';

import { useState, useMemo, useCallback } from 'react';
import { ROOM_INVENTORY, getRoomCategory } from '@/lib/constants/rooms';
import { isoDate, daysBetween } from '@/lib/utils/date';
import type { Booking } from '@/lib/types/booking';
import type { RoomCategory } from '@/lib/constants/rooms';
import type { MaintenanceBlock } from './page';

import { OccupancyHeader } from '@/components/calendar/OccupancyHeader';
import { OccupancyKPIs } from '@/components/calendar/OccupancyKPIs';
import { OccupancyFilters } from '@/components/calendar/OccupancyFilters';
import type { RoomTypeFilter, StatusFilter } from '@/components/calendar/OccupancyFilters';
import { OccupancyHeatmap } from '@/components/calendar/OccupancyHeatmap';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import { BookingTooltip } from '@/components/calendar/BookingTooltip';
import type { TooltipData } from '@/components/calendar/BookingTooltip';
import { LegendPanel } from '@/components/calendar/LegendPanel';

import dynamic from 'next/dynamic';
import { Search } from 'lucide-react';
import { useCurrentUser } from '@/context/UserContext';

const RoomAvailabilityModal = dynamic(
  () => import('@/components/calendar/RoomAvailabilityModal').then((m) => ({ default: m.RoomAvailabilityModal })),
  { ssr: false },
);

const CELL_WIDTH = 36;
const ROW_HEIGHT = 40;
const SIDEBAR_WIDTH = 160;
const TOTAL_ROOMS = 54;

const DAY_ABBRS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getCatBadge(cat: RoomCategory): string {
  if (cat === 'Kesar Khema') return 'KK';
  if (cat === 'Orchard Cottage') return 'OC';
  if (cat === 'Premium Orchard Cottage') return 'POC';
  if (cat === 'Kothi') return 'K';
  return 'R';
}

function getShortRoomName(room: string, cat: RoomCategory): string {
  if (cat === 'Kesar Khema') return room.replace('Kesar Khema Room ', 'KK-');
  if (cat === 'Orchard Cottage') return room.replace('Orchard Cottage ', 'OC-');
  if (cat === 'Premium Orchard Cottage') return room.replace('Premium Orchard Cottage ', 'POC-');
  if (cat === 'Kothi') {
    if (room.includes('Dasheri')) return 'Dasheri 2BR';
    if (room.includes('Amarpali')) return 'Amarpali 3BR';
  }
  return room;
}

// Blocked rooms (status='hold') are tentative and must NOT inflate occupancy or
// other KPIs — only a real booking (confirmed / checked-in / checked-out) counts
// a room as physically occupied. Holds still render on the grid (yellow bars).
function countsAsOccupied(b: Booking): boolean {
  return b.status === 'confirmed' || b.status === 'checked_in' || b.status === 'checked_out';
}

interface Props {
  initialBookings: Booking[];
  maintenanceBlocks: MaintenanceBlock[];
}

export function CalendarClient({ initialBookings: bookings, maintenanceBlocks }: Props) {
  // Local calendar date (YYYY-MM-DD). Built from local parts to match the day
  // cells and the <input type="date"> values bookings are saved with. isoDate()
  // uses UTC and would be a day behind in +UTC zones (e.g. IST before 05:30),
  // which mis-highlighted "today" and skewed the today-KPIs.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const [monthOffset, setMonthOffset] = useState(0);
  const [roomTypeFilter, setRoomTypeFilter] = useState<RoomTypeFilter>('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [guestSearch, setGuestSearch] = useState('');
  const [tooltip, setTooltip] = useState<{ data: TooltipData; x: number; y: number } | null>(null);

  const currentUser = useCurrentUser();
  const canCheckAvailability =
    currentUser?.role === 'Sales' || currentUser?.role === 'Sales Admin' || currentUser?.role === 'Admin';
  const [showAvailability, setShowAvailability] = useState(false);

  // Month calculation
  const { year, month, days, monthLabel } = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    const yr = d.getFullYear();
    const mo = d.getMonth();
    const lastDay = new Date(yr, mo + 1, 0).getDate();
    const daysArr = Array.from({ length: lastDay }, (_, i) => {
      const dayNum = i + 1;
      const date = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const dow = new Date(yr, mo, dayNum).getDay();
      return {
        date,
        dayNum,
        dayAbbr: DAY_ABBRS[dow] ?? 'Sun',
        isToday: date === today,
        isWeekend: dow === 0 || dow === 6,
      };
    });
    return {
      year: yr,
      month: mo,
      days: daysArr,
      monthLabel: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  }, [monthOffset, today]);

  // Date index map: date -> index in days array
  const dateIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    days.forEach((d, i) => m.set(d.date, i));
    return m;
  }, [days]);

  // All rooms flat
  const allRoomRows = useMemo(() => {
    return Object.entries(ROOM_INVENTORY).flatMap(([cat, rooms]) =>
      rooms.map((room) => {
        const catTyped = cat as RoomCategory;
        return {
          room,
          cat: catTyped,
          shortName: getShortRoomName(room, catTyped),
          catBadge: getCatBadge(catTyped),
          catColor: catTyped,
        };
      })
    );
  }, []);

  // Filtered bookings based on guest search and status
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (b.status === 'cancelled') return false;
      if (statusFilter === 'maintenance') return false;
      if (statusFilter !== 'All' && b.status !== statusFilter) return false;
      if (guestSearch.trim()) {
        const q = guestSearch.toLowerCase();
        if (
          !b.guestName.toLowerCase().includes(q) &&
          !b.confirmationNumber.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [bookings, statusFilter, guestSearch]);

  // Build bookingsByRoom for current month
  const bookingsByRoom = useMemo(() => {
    const map = new Map<string, Array<{ booking: Booking; startIdx: number; nights: number }>>();

    filteredBookings.forEach((booking) => {
      (booking.rooms ?? []).forEach((room) => {
        // Clamp booking to visible month
        const arrivalDate = booking.arrival < days[0]!.date ? days[0]!.date : booking.arrival;
        const departureDate =
          booking.departure > days[days.length - 1]!.date
            ? days[days.length - 1]!.date
            : booking.departure;

        const startIdx = dateIndexMap.get(arrivalDate);
        if (startIdx === undefined) return;

        // Calculate visible nights
        const endIdx = dateIndexMap.get(departureDate);
        const visibleNights =
          endIdx !== undefined
            ? endIdx - startIdx
            : days.length - startIdx;

        if (visibleNights <= 0) return;

        // Check if booking overlaps with this month
        if (booking.departure <= days[0]!.date || booking.arrival > days[days.length - 1]!.date) return;

        const existing = map.get(room) ?? [];
        existing.push({ booking, startIdx, nights: visibleNights });
        map.set(room, existing);
      });
    });

    return map;
  }, [filteredBookings, days, dateIndexMap]);

  // Build maintenanceByRoom for current month
  const maintenanceByRoom = useMemo(() => {
    const map = new Map<string, Array<{ block: MaintenanceBlock; startIdx: number; nights: number }>>();

    if (statusFilter === 'confirmed' || statusFilter === 'hold') return map;

    maintenanceBlocks.forEach((block) => {
      if (block.dateTo <= days[0]!.date || block.dateFrom > days[days.length - 1]!.date) return;

      const arrivalDate = block.dateFrom < days[0]!.date ? days[0]!.date : block.dateFrom;
      const departureDate =
        block.dateTo > days[days.length - 1]!.date
          ? days[days.length - 1]!.date
          : block.dateTo;

      const startIdx = dateIndexMap.get(arrivalDate);
      if (startIdx === undefined) return;

      const endDate = new Date(departureDate);
      const endIdx = dateIndexMap.get(isoDate(endDate));
      const visibleNights =
        endIdx !== undefined
          ? endIdx - startIdx
          : days.length - startIdx;

      if (visibleNights <= 0) return;

      const existing = map.get(block.roomName) ?? [];
      existing.push({ block, startIdx, nights: visibleNights });
      map.set(block.roomName, existing);
    });

    return map;
  }, [maintenanceBlocks, days, dateIndexMap, statusFilter]);

  // Filter rooms based on filters
  const filteredRooms = useMemo(() => {
    return allRoomRows.filter((rr) => {
      if (roomTypeFilter !== 'All' && rr.cat !== roomTypeFilter) return false;

      // If status filter is maintenance, only show rooms with maintenance blocks
      if (statusFilter === 'maintenance') {
        return maintenanceByRoom.has(rr.room);
      }

      // If guest search, only show rooms with matching bookings
      if (guestSearch.trim()) {
        return bookingsByRoom.has(rr.room);
      }

      return true;
    });
  }, [allRoomRows, roomTypeFilter, statusFilter, guestSearch, maintenanceByRoom, bookingsByRoom]);

  // KPI calculations
  const kpis = useMemo(() => {
    // Today's occupied rooms
    const todayBookedRooms = new Set<string>();
    const todayCheckIns: Set<string> = new Set();
    const todayCheckOuts: Set<string> = new Set();
    let revenueImpact = 0;

    bookings.forEach((b) => {
      if (!countsAsOccupied(b)) return;
      // Month revenue
      if (b.arrival.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) {
        revenueImpact += b.totalAmount ?? 0;
      }
      // Today occupancy
      (b.rooms ?? []).forEach((room) => {
        if (b.arrival < today && b.departure > today) {
          todayBookedRooms.add(room);
        }
        if (b.arrival === today) {
          todayCheckIns.add(b.id);
          todayBookedRooms.add(room);
        }
        if (b.departure === today) {
          todayCheckOuts.add(b.id);
        }
      });
    });

    // Maintenance rooms (any active today)
    const maintenanceRooms = new Set<string>();
    maintenanceBlocks.forEach((block) => {
      if (block.dateFrom <= today && block.dateTo > today) {
        maintenanceRooms.add(block.roomName);
      }
    });

    const occupiedRooms = todayBookedRooms.size;
    const occupancyRate = Math.round((occupiedRooms / TOTAL_ROOMS) * 100);

    return {
      occupancyRate,
      occupiedRooms,
      totalRooms: TOTAL_ROOMS,
      todayCheckIns: todayCheckIns.size,
      todayCheckOuts: todayCheckOuts.size,
      revenueImpact,
      maintenanceRooms: maintenanceRooms.size,
    };
  }, [bookings, maintenanceBlocks, today, year, month]);

  // Per-day occupancy for heatmap
  const dayOccupancy = useMemo(() => {
    return days.map((day) => {
      const bookedRooms = new Set<string>();
      bookings.forEach((b) => {
        if (!countsAsOccupied(b)) return;
        if (b.arrival <= day.date && b.departure > day.date) {
          (b.rooms ?? []).forEach((r) => bookedRooms.add(r));
        }
      });
      const pct = Math.round((bookedRooms.size / TOTAL_ROOMS) * 100);
      return { date: day.date, dayNum: day.dayNum, pct };
    });
  }, [bookings, days]);

  const handleTooltip = useCallback(
    (data: TooltipData | null, x: number, y: number) => {
      if (!data) {
        setTooltip(null);
      } else {
        setTooltip({ data, x, y });
      }
    },
    []
  );

  return (
    <div style={{ backgroundColor: '#F8F7F4', minHeight: '100%' }}>
      <OccupancyHeader
        monthLabel={monthLabel}
        onPrev={() => setMonthOffset((m) => m - 1)}
        onNext={() => setMonthOffset((m) => m + 1)}
        onToday={() => setMonthOffset(0)}
      />

      {canCheckAvailability && (
        <div className="px-4 pt-3">
          <button
            onClick={() => setShowAvailability(true)}
            className="inline-flex items-center gap-2 bg-emerald-800 text-amber-50 text-sm px-4 py-2 hover:bg-emerald-700 transition tracking-wide"
          >
            <Search size={14} /> Check Availability
          </button>
        </div>
      )}

      <OccupancyKPIs kpis={kpis} />

      {showAvailability && (
        <RoomAvailabilityModal
          bookings={bookings}
          maintenanceBlocks={maintenanceBlocks}
          onClose={() => setShowAvailability(false)}
        />
      )}

      <OccupancyFilters
        roomTypeFilter={roomTypeFilter}
        statusFilter={statusFilter}
        guestSearch={guestSearch}
        onRoomTypeChange={setRoomTypeFilter}
        onStatusChange={setStatusFilter}
        onGuestSearchChange={setGuestSearch}
      />

      {/* Calendar grid with heatmap */}
      <div className="overflow-x-auto" style={{ position: 'relative' }}>
        {/* Heatmap row */}
        <div style={{ minWidth: SIDEBAR_WIDTH + days.length * CELL_WIDTH }}>
          <OccupancyHeatmap
            days={dayOccupancy}
            cellWidth={CELL_WIDTH}
            sidebarWidth={SIDEBAR_WIDTH}
          />
        </div>

        {/* Main grid */}
        <CalendarGrid
          rooms={filteredRooms}
          days={days}
          bookingsByRoom={bookingsByRoom}
          maintenanceByRoom={maintenanceByRoom}
          cellWidth={CELL_WIDTH}
          rowHeight={ROW_HEIGHT}
          sidebarWidth={SIDEBAR_WIDTH}
          onTooltip={handleTooltip}
        />
      </div>

      {filteredRooms.length === 0 && (
        <div className="flex items-center justify-center py-16 text-stone-400 text-sm italic">
          No rooms match the current filters.
        </div>
      )}

      <LegendPanel />

      {/* Tooltip */}
      {tooltip && (
        <BookingTooltip
          data={tooltip.data}
          x={tooltip.x}
          y={tooltip.y}
        />
      )}
    </div>
  );
}
