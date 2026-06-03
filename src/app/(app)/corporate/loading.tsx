export default function CorporateLoading() {
  return (
    <div className="animate-pulse">
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <div className="h-8 w-52 bg-stone-200 rounded mb-2" />
          <div className="h-4 w-64 bg-stone-100 rounded" />
        </div>
        <div className="h-10 w-44 bg-stone-300 rounded" />
      </div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-stone-200 p-4">
            <div className="h-3 w-24 bg-stone-200 rounded mb-3" />
            <div className="h-7 w-16 bg-stone-300 rounded mb-2" />
            <div className="h-3 w-28 bg-stone-100 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white border border-stone-200">
        <div className="bg-emerald-900 h-10" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4 border-b border-stone-100">
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-40 bg-stone-200 rounded" />
              <div className="h-3 w-28 bg-stone-100 rounded" />
            </div>
            <div className="h-5 w-36 bg-stone-200 rounded" />
            <div className="h-3 w-24 bg-stone-100 rounded" />
            <div className="flex gap-1">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-7 w-16 bg-stone-200 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
