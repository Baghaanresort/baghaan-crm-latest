'use client';

export function LegendPanel() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 px-3 py-2.5 bg-stone-50 rounded-xl border border-stone-200">
      <span className="text-[10px] uppercase tracking-widest text-stone-400 font-medium mr-1">Legend</span>

      <div className="flex items-center gap-1.5">
        <span className="inline-block w-8 h-3 rounded-sm" style={{ backgroundColor: '#22C55E' }} />
        <span className="text-xs text-stone-600">Confirmed</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="inline-block w-8 h-3 rounded-sm" style={{ backgroundColor: '#FACC15' }} />
        <span className="text-xs text-stone-600">Hold / Tentative</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="inline-block w-8 h-3 rounded-sm" style={{ backgroundColor: '#60A5FA' }} />
        <span className="text-xs text-stone-600">Checked In</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="inline-block w-8 h-3 rounded-sm" style={{ backgroundColor: '#EF4444' }} />
        <span className="text-xs text-stone-600">Maintenance</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="inline-block w-8 h-3 rounded-sm bg-emerald-50 border-b-2 border-emerald-500" />
        <span className="text-xs text-stone-600">Today</span>
      </div>
    </div>
  );
}
