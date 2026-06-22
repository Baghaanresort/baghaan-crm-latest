'use client';

import { Plus, Trash2 } from 'lucide-react';
import { NumberInput } from '@/components/ui/NumberInput';
import { addOnsTotal } from '@/lib/utils/booking';
import type { AddOn } from '@/lib/types/booking';

// Line-item editor for booking extras (meals, transfers, activities…). Each row's
// Total is derived (price × units); the section total rolls into the package total.
export function AddOnsEditor({ value, onChange }: { value: AddOn[]; onChange: (rows: AddOn[]) => void }) {
  const rows = value ?? [];

  const patchRow = (i: number, patch: Partial<AddOn>) =>
    onChange(rows.map((r, idx) => {
      if (idx !== i) return r;
      const next = { ...r, ...patch };
      next.total = (Number(next.pricePerUnit) || 0) * (Number(next.units) || 0);
      return next;
    }));

  const addRow = () => onChange([...rows, { name: '', pricePerUnit: 0, units: 1, total: 0 }]);
  const removeRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  const total = addOnsTotal(rows);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-stone-600 uppercase tracking-wider">Add Ons</label>
        <button type="button" onClick={addRow} className="inline-flex items-center gap-1 text-xs border border-stone-300 bg-white px-2.5 py-1 hover:bg-stone-50 text-stone-600 transition">
          <Plus size={12} /> Add row
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-stone-400 italic">No add-ons. Use “Add row” to charge extras (meals, transfers, activities…).</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_7rem_6rem_7rem_2rem] gap-2 text-xs text-stone-500 uppercase tracking-wider px-1">
            <span>Name of Add-On</span>
            <span className="text-right">Price / Unit</span>
            <span className="text-right">Units</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_6rem_7rem_2rem] gap-2 items-center">
              <input
                value={r.name}
                onChange={e => patchRow(i, { name: e.target.value })}
                placeholder="e.g. Candle-light dinner"
                className="px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white"
              />
              <NumberInput value={r.pricePerUnit} min={0} onChange={n => patchRow(i, { pricePerUnit: n })}
                className="px-2 py-2 border border-stone-300 text-sm text-right outline-none focus:border-emerald-700 bg-white" />
              <NumberInput value={r.units} min={0} onChange={n => patchRow(i, { units: n })}
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
            Add-ons total: <strong className="text-stone-800">₹{total.toLocaleString('en-IN')}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
