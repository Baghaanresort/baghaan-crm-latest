export default function CalendarLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-stone-300">
        <div className="h-8 w-36 bg-stone-200 rounded" />
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-stone-200 rounded" />
          <div className="h-6 w-36 bg-stone-300 rounded" />
          <div className="h-8 w-8 bg-stone-200 rounded" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="bg-white border border-stone-200">
          <div className="bg-emerald-900 h-10" />
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex border-b border-stone-100">
              <div className="w-36 flex-shrink-0 px-3 py-2 border-r border-stone-200">
                <div className="h-3 w-28 bg-stone-200 rounded" />
              </div>
              <div className="flex flex-1">
                {Array.from({ length: 15 }).map((_, j) => (
                  <div key={j} className="flex-1 h-8 border-r border-stone-100 bg-stone-50" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
