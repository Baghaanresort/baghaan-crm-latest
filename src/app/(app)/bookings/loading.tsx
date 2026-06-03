export default function BookingsLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <div className="h-8 w-40 bg-stone-200 rounded mb-2" />
          <div className="h-4 w-48 bg-stone-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-28 bg-stone-200 rounded" />
          <div className="h-10 w-32 bg-stone-200 rounded" />
          <div className="h-10 w-36 bg-stone-300 rounded" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 h-10 bg-stone-200 rounded" />
        <div className="h-10 w-32 bg-stone-200 rounded" />
        <div className="h-10 w-36 bg-stone-200 rounded" />
        <div className="h-10 w-40 bg-stone-200 rounded" />
      </div>

      {/* Table */}
      <div className="bg-white border border-stone-200">
        <div className="bg-emerald-900 h-10" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-3.5 border-b border-stone-100">
            <div className="h-3 w-28 bg-stone-200 rounded" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-36 bg-stone-200 rounded" />
              <div className="h-3 w-24 bg-stone-100 rounded" />
            </div>
            <div className="h-3 w-32 bg-stone-100 rounded" />
            <div className="h-5 w-20 bg-stone-200 rounded" />
            <div className="h-3 w-20 bg-stone-100 rounded" />
            <div className="h-3 w-20 bg-stone-100 rounded" />
            <div className="h-3 w-20 bg-stone-100 rounded" />
            <div className="h-3 w-16 bg-stone-100 rounded" />
            <div className="flex gap-1">
              <div className="h-7 w-7 bg-stone-200 rounded" />
              <div className="h-7 w-12 bg-stone-200 rounded" />
              <div className="h-7 w-7 bg-stone-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
