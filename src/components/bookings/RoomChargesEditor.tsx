'use client';

import { Plus, Trash2 } from 'lucide-react';
import { NumberInput } from '@/components/ui/NumberInput';
import { roomChargesTotal } from '@/lib/utils/booking';
import { getRoomCategory, DEFAULT_RATES } from '@/lib/constants/rooms';
import type { RoomCharge } from '@/lib/types/booking';

// Auto-seed room charges from the selected rooms, grouped by category. The per-room
// price is the category's default nightly rate × nights; Total = price × no. of rooms.
export function seedRoomCharges(rooms: string[], nights: number): RoomCharge[] {
  const byCat = new Map<ReturnType<typeof getRoomCategory>, number>();
  for (const r of rooms) {
    const cat = getRoomCategory(r);
    byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
  }
  const n = Math.max(1, nights);
  return [...byCat.entries()].map(([cat, count]) => {
    const price = (cat !== 'Other' ? DEFAULT_RATES[cat] : 0) * n;
    return { roomType: String(cat), roomPrice: price, numberOfRooms: count, total: price * count };
  });
}

// Line-item editor for the room charges. Each row's Total is derived (price × rooms);
// the section total is the "rooms" portion of the package total.
export function RoomChargesEditor({ value, onChange }: { value: RoomCharge[]; onChange: (rows: RoomCharge[]) => void }) {
  const rows = value ?? [];

  const patchRow = (i: number, patch: Partial<RoomCharge>) =>
    onChange(rows.map((r, idx) => {
      if (idx !== i) return r;
      const next = { ...r, ...patch };
      next.total = (Number(next.roomPrice) || 0) * (Number(next.numberOfRooms) || 0);
      return next;
    }));

  const addRow = () => onChange([...rows, { roomType: '', roomPrice: 0, numberOfRooms: 1, total: 0 }]);
  const removeRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  const total = roomChargesTotal(rows);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-stone-600 uppercase tracking-wider">Room Charges</label>
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1 text-xs border border-stone-300 bg-white px-2.5 py-1 hover:bg-stone-50 text-stone-600 transition">
          <Plus size={12} /> Add row
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-stone-400 italic">Select rooms above to auto-fill this, or “Add row” to enter charges manually.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_7rem_6rem_7rem_2rem] gap-2 text-xs text-stone-500 uppercase tracking-wider px-1">
            <span>Room Type</span>
            <span className="text-right">Room Price</span>
            <span className="text-right">No. of Rooms</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_6rem_7rem_2rem] gap-2 items-center">
              <input
                value={r.roomType}
                onChange={e => patchRow(i, { roomType: e.target.value })}
                placeholder="e.g. Orchard Cottage"
                className="px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white"
              />
              <NumberInput value={r.roomPrice} min={0} onChange={n => patchRow(i, { roomPrice: n })}
                className="px-2 py-2 border border-stone-300 text-sm text-right outline-none focus:border-emerald-700 bg-white" />
              <NumberInput value={r.numberOfRooms} min={0} onChange={n => patchRow(i, { numberOfRooms: n })}
                className="px-2 py-2 border border-stone-300 text-sm text-right outline-none focus:border-emerald-700 bg-white" />
              <div className="px-2 py-2 text-sm text-right font-medium bg-stone-100 text-stone-700">
                ₹{(Number(r.total) || 0).toLocaleString('en-IN')}
              </div>
              <button type="button" onClick={() => removeRow(i)} title="Remove" className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded transition">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="text-xs text-right text-stone-600 pt-1">
            Room charges total: <strong className="text-stone-800">₹{total.toLocaleString('en-IN')}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
