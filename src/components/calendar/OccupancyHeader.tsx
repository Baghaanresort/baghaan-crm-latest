'use client';

import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

interface Props {
  monthLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function OccupancyHeader({ monthLabel, onPrev, onNext, onToday }: Props) {
  return (
    <div className="flex items-center justify-between mb-5 pb-4 border-b border-stone-200">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#005C4B' }}>
          <CalendarDays size={18} className="text-amber-200" />
        </div>
        <div>
          <h2
            className="text-2xl leading-tight"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, color: '#005C4B' }}
          >
            Occupancy Calendar
          </h2>
          <p className="text-sm text-stone-500 italic">Room availability at a glance</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onPrev}
          className="w-8 h-8 flex items-center justify-center border border-stone-300 rounded-lg hover:bg-stone-100 transition-colors text-stone-600"
          title="Previous month"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          onClick={onToday}
          title="Jump to current month"
          className="px-3 h-8 min-w-[130px] border border-stone-300 rounded-lg hover:bg-stone-100 transition-colors text-stone-700 text-sm font-medium"
        >
          {monthLabel}
        </button>
        <button
          onClick={onNext}
          className="w-8 h-8 flex items-center justify-center border border-stone-300 rounded-lg hover:bg-stone-100 transition-colors text-stone-600"
          title="Next month"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
