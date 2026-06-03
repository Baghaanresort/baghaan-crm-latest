export default function DashboardLoading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <div className="h-8 w-56 bg-stone-200 rounded mb-2" />
          <div className="h-4 w-72 bg-stone-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-32 bg-stone-200 rounded" />
          <div className="h-10 w-36 bg-stone-200 rounded" />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white border border-stone-200 p-4">
            <div className="h-3 w-24 bg-stone-200 rounded mb-3" />
            <div className="h-8 w-20 bg-stone-300 rounded mb-2" />
            <div className="h-3 w-32 bg-stone-100 rounded" />
          </div>
        ))}
      </div>

      {/* MTD Panel */}
      <div className="bg-white border border-stone-300 mb-6">
        <div className="px-5 py-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
          <div className="h-4 w-48 bg-stone-200 rounded" />
          <div className="h-3 w-24 bg-stone-100 rounded" />
        </div>
        <div className="grid grid-cols-4 gap-px bg-stone-200">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="bg-white p-4">
              <div className="h-3 w-28 bg-stone-200 rounded mb-3" />
              <div className="h-6 w-20 bg-stone-300 rounded mb-2" />
              <div className="h-3 w-32 bg-stone-100 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom panels */}
      <div className="grid grid-cols-2 gap-6">
        {[0, 1].map(i => (
          <div key={i} className="bg-white border border-stone-200 p-5">
            <div className="h-4 w-32 bg-stone-200 rounded mb-4" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex justify-between py-2 border-b border-stone-100">
                <div className="h-3 w-32 bg-stone-200 rounded" />
                <div className="h-3 w-20 bg-stone-100 rounded" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
