export default function VouchersLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 pb-4 border-b border-stone-300">
        <div className="h-8 w-48 bg-stone-200 rounded mb-2" />
        <div className="h-4 w-60 bg-stone-100 rounded" />
      </div>
      <div className="h-10 bg-stone-200 rounded mb-4" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white border border-stone-200 p-4">
            <div className="flex justify-between mb-3">
              <div>
                <div className="h-4 w-36 bg-stone-200 rounded mb-1.5" />
                <div className="h-3 w-28 bg-stone-100 rounded" />
              </div>
              <div className="h-5 w-5 bg-stone-200 rounded" />
            </div>
            <div className="space-y-1.5">
              <div className="h-3 w-48 bg-stone-100 rounded" />
              <div className="h-3 w-32 bg-stone-100 rounded" />
              <div className="h-3 w-24 bg-stone-200 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
