'use client';

import { Search, SlidersHorizontal } from 'lucide-react';
import type { RoomCategory } from '@/lib/constants/rooms';

export type RoomTypeFilter = 'All' | RoomCategory;
export type StatusFilter = 'All' | 'confirmed' | 'hold' | 'maintenance';

interface Props {
  roomTypeFilter: RoomTypeFilter;
  statusFilter: StatusFilter;
  guestSearch: string;
  onRoomTypeChange: (v: RoomTypeFilter) => void;
  onStatusChange: (v: StatusFilter) => void;
  onGuestSearchChange: (v: string) => void;
}

const ROOM_TYPES: RoomTypeFilter[] = [
  'All',
  'Kesar Khema',
  'Orchard Cottage',
  'Premium Orchard Cottage',
  'Kothi',
];

const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: 'All', label: 'All Status' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'hold', label: 'On Hold' },
  { value: 'maintenance', label: 'Maintenance' },
];

const ROOM_LABELS: Record<RoomTypeFilter, string> = {
  'All': 'All Types',
  'Kesar Khema': 'Kesar Khema',
  'Orchard Cottage': 'Orchard Cottage',
  'Premium Orchard Cottage': 'Premium OC',
  'Kothi': 'Kothi',
};

export function OccupancyFilters({
  roomTypeFilter,
  statusFilter,
  guestSearch,
  onRoomTypeChange,
  onStatusChange,
  onGuestSearchChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-stone-50 rounded-xl border border-stone-200">
      <SlidersHorizontal size={14} className="text-stone-400 shrink-0" />

      {/* Room type filter */}
      <div className="flex flex-wrap gap-1">
        {ROOM_TYPES.map((rt) => (
          <button
            key={rt}
            onClick={() => onRoomTypeChange(rt)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              roomTypeFilter === rt
                ? 'text-white shadow-sm'
                : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
            }`}
            style={roomTypeFilter === rt ? { backgroundColor: '#005C4B' } : {}}
          >
            {ROOM_LABELS[rt]}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-stone-200 hidden sm:block" />

      {/* Status filter */}
      <div className="flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => onStatusChange(s.value)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === s.value
                ? s.value === 'confirmed'
                  ? 'bg-emerald-600 text-white'
                  : s.value === 'hold'
                  ? 'bg-amber-500 text-white'
                  : s.value === 'maintenance'
                  ? 'bg-red-500 text-white'
                  : 'text-white shadow-sm'
                : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
            }`}
            style={
              statusFilter === s.value && s.value === 'All'
                ? { backgroundColor: '#005C4B' }
                : {}
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-stone-200 hidden sm:block" />

      {/* Guest search */}
      <div className="relative flex-1 min-w-36">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          type="text"
          placeholder="Search guest..."
          value={guestSearch}
          onChange={(e) => onGuestSearchChange(e.target.value)}
          className="w-full pl-7 pr-3 py-1.5 text-xs border border-stone-200 rounded-lg bg-white outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100"
        />
      </div>
    </div>
  );
}
