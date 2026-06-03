export default function AccountsLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 pb-4 border-b border-stone-300">
        <div className="h-8 w-36 bg-stone-200 rounded mb-2" />
        <div className="h-4 w-56 bg-stone-100 rounded" />
      </div>
      <div className="flex gap-1 mb-4 border-b border-stone-200">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-40 bg-stone-200 rounded-t" />
        ))}
      </div>
      <div className="bg-white border border-stone-200">
        <div className="bg-emerald-900 h-10" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-3 border-b border-stone-100">
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-36 bg-stone-200 rounded" />
              <div className="h-3 w-24 bg-stone-100 rounded" />
            </div>
            <div className="h-3 w-24 bg-stone-100 rounded" />
            <div className="h-3 w-20 bg-stone-100 rounded" />
            <div className="h-3 w-20 bg-stone-100 rounded" />
            <div className="h-5 w-24 bg-stone-200 rounded" />
            <div className="flex gap-1">
              <div className="h-7 w-20 bg-stone-200 rounded" />
              <div className="h-7 w-7 bg-stone-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
