'use client';

import { useMemo } from 'react';

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

interface DayOccupancy {
  date: string;
  dayNum: number;
  pct: number;
}

interface Props {
  days: DayOccupancy[];
  cellWidth: number;
  sidebarWidth: number;
}

function getBarColor(pct: number): string {
  if (pct === 0) return '#d1d5db'; // gray-300
  if (pct < 40) return '#22c55e';  // green-500
  if (pct < 70) return '#f59e0b';  // amber-500
  return '#ef4444';                 // red-500
}

function getBlock(pct: number): string {
  if (pct === 0) return '▁';
  const idx = Math.min(7, Math.floor((pct / 100) * 8));
  return BLOCKS[idx] ?? '█';
}

export function OccupancyHeatmap({ days, cellWidth, sidebarWidth }: Props) {
  return (
    <div
      className="flex items-end border-b border-stone-200 bg-stone-50"
      style={{ height: 40 }}
    >
      {/* Sidebar placeholder */}
      <div
        className="shrink-0 h-full flex items-center px-3 border-r border-stone-200"
        style={{ width: sidebarWidth, position: 'sticky', left: 0, zIndex: 10, backgroundColor: '#F8F7F4' }}
      >
        <span className="text-[10px] uppercase tracking-widest text-stone-400 font-medium">Occ %</span>
      </div>

      {/* Day bars */}
      {days.map((day) => {
        const color = getBarColor(day.pct);
        const block = getBlock(day.pct);
        const barHeight = day.pct === 0 ? 4 : Math.max(6, Math.round((day.pct / 100) * 28));

        return (
          <div
            key={day.date}
            className="flex flex-col items-center justify-end h-full border-r border-stone-100 group relative"
            style={{ width: cellWidth, minWidth: cellWidth }}
            title={`${day.pct}% occupied`}
          >
            {/* Percentage tooltip on hover */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-stone-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
              {day.pct}%
            </div>
            {/* Visual bar */}
            <div
              style={{
                width: cellWidth - 4,
                height: barHeight,
                backgroundColor: color,
                borderRadius: '2px 2px 0 0',
                opacity: 0.85,
                marginBottom: 3,
                transition: 'height 0.2s ease',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
