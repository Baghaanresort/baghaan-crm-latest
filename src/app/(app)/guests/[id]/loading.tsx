export default function GuestProfileLoading() {
  return (
    <div className="animate-pulse">
      {/* Back link */}
      <div className="h-4 w-24 bg-stone-200 rounded mb-6" />

      {/* Header */}
      <div className="flex items-start justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <div className="h-8 w-48 bg-stone-200 rounded mb-2" />
          <div className="h-4 w-32 bg-stone-100 rounded" />
        </div>
        <div className="h-9 w-24 bg-stone-200 rounded" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-stone-200 p-4">
            <div className="h-3 w-20 bg-stone-200 rounded mb-3" />
            <div className="h-7 w-16 bg-stone-300 rounded mb-1" />
            <div className="h-3 w-24 bg-stone-100 rounded" />
          </div>
        ))}
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i}>
              <div className="h-3 w-20 bg-stone-200 rounded mb-1.5" />
              <div className="h-9 w-full bg-stone-100 rounded" />
            </div>
          ))}
        </div>
        <div className="col-span-2">
          <div className="h-4 w-28 bg-stone-200 rounded mb-4" />
          <div className="bg-white border border-stone-200">
            <div className="bg-emerald-900 h-10" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-3 py-3 border-b border-stone-100">
                <div className="h-3 w-24 bg-stone-200 rounded" />
                <div className="h-3 w-24 bg-stone-200 rounded" />
                <div className="h-3 w-16 bg-stone-100 rounded" />
                <div className="h-3 w-20 bg-stone-100 rounded" />
                <div className="h-3 w-20 bg-stone-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
