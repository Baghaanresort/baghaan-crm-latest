'use client';

import { useState, useMemo, useTransition } from 'react';
import { X, Plus, Trash2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { updateCostSheet, sendCostSheet, markCostSheetAccepted } from '@/lib/actions/corporate';
import { LINE_ITEM_CATALOGUE } from '@/lib/constants/catalogue';
import { datesInRange, fmtDate, isoDate } from '@/lib/utils/date';
import { NumberInput } from '@/components/ui/NumberInput';
import type { Booking, LineItem } from '@/lib/types/booking';

interface Props {
  booking: Booking;
  currentUser: { name: string; role: string };
  onClose: () => void;
}

interface EditLineItem extends Omit<LineItem, 'total'> {
  _id: string;
  total?: number;
}

export function CostSheetModal({ booking, currentUser, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const stage = booking.corporateStage ?? 'inquiry';
  const stayDays = useMemo(() => datesInRange(booking.arrival, booking.departure), [booking.arrival, booking.departure]);

  const [items, setItems] = useState<EditLineItem[]>(() =>
    (booking.costSheet?.lineItems ?? []).map(li => ({ ...li, _id: `${Math.random()}`, total: li.rate * li.qty }))
  );
  const [notes, setNotes] = useState(booking.costSheet?.notes ?? '');
  const [inclusions, setInclusions] = useState<string[]>(booking.costSheet?.inclusions ?? [
    'Welcome drink on arrival', 'Daily breakfast', 'Evening bonfire', 'Swimming pool access', 'Nature walk',
  ]);
  const [terms, setTerms] = useState(booking.costSheet?.terms ?? 'GST as applicable. 50% advance required to confirm booking. No refund for no-show or last minute cancellation.');
  const [showCatalogue, setShowCatalogue] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const m: Record<string, number> = {};
    items.forEach(li => {
      const k = li.day || 'multi';
      m[k] = (m[k] ?? 0) + Number(li.rate ?? 0) * Number(li.qty ?? 1);
    });
    return m;
  }, [items]);

  const grandTotal = useMemo(() => Object.values(byDay).reduce((s, v) => s + v, 0), [byDay]);

  const updateItem = (id: string, field: keyof EditLineItem, value: string) => {
    setItems(prev => prev.map(li => {
      if (li._id !== id) return li;
      const updated = { ...li, [field]: field === 'rate' || field === 'qty' || field === 'units' ? Number(value) : value };
      updated.total = Number(updated.rate ?? 0) * Number(updated.qty ?? 1);
      return updated;
    }));
  };

  const addItem = (day: string, dayLabel: string) => {
    setItems(prev => [...prev, { _id: `${Date.now()}`, day, dayLabel, particular: '', rate: 0, qty: 1, units: 1, total: 0, category: 'Custom' }]);
  };

  const addFromCatalogue = (day: string, dayLabel: string, item: { name: string; defaultRate: number; unit: string }, category: string) => {
    setItems(prev => [...prev, { _id: `${Date.now()}`, day, dayLabel, particular: item.name, rate: item.defaultRate, qty: 1, units: 1, total: item.defaultRate, category }]);
    setShowCatalogue(null);
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(li => li._id !== id));

  const getLineItemsForSave = (): LineItem[] =>
    items.map(li => ({
      day: li.day,
      dayLabel: li.dayLabel,
      particular: li.particular,
      rate: Number(li.rate ?? 0),
      qty: Number(li.qty ?? 1),
      units: Number(li.units ?? 1),
      total: Number(li.rate ?? 0) * Number(li.qty ?? 1),
      category: li.category,
    }));

  const handleSaveDraft = () => {
    startTransition(async () => {
      const result = await updateCostSheet(booking.id, { lineItems: getLineItemsForSave(), grandTotal, notes, inclusions, terms });
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Cost sheet saved');
    });
  };

  const handleSaveAndSend = () => {
    startTransition(async () => {
      const saveResult = await updateCostSheet(booking.id, { lineItems: getLineItemsForSave(), grandTotal, notes, inclusions, terms });
      if (!saveResult.success) { toast.error(saveResult.error); return; }
      const sendResult = await sendCostSheet(booking.id);
      if (!sendResult.success) { toast.error(sendResult.error); return; }
      toast.success('Cost sheet saved and marked as sent');
      onClose();
    });
  };

  const handleSaveAndAccept = () => {
    startTransition(async () => {
      const saveResult = await updateCostSheet(booking.id, { lineItems: getLineItemsForSave(), grandTotal, notes, inclusions, terms });
      if (!saveResult.success) { toast.error(saveResult.error); return; }
      const acceptResult = await markCostSheetAccepted(booking.id);
      if (!acceptResult.success) { toast.error(acceptResult.error); return; }
      toast.success('Cost sheet accepted');
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-stone-50 max-w-5xl w-full my-8 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-stone-800 text-white px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">Cost Sheet — {booking.companyName}</h2>
            <p className="text-xs text-stone-300 mt-0.5">{fmtDate(booking.arrival)} → {fmtDate(booking.departure)} · {booking.nights} nights · Grand Total: ₹{grandTotal.toLocaleString('en-IN')}</p>
          </div>
          <button onClick={onClose} className="hover:bg-stone-700 p-1.5 rounded"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Day sections */}
          {stayDays.map((day, idx) => {
            const dayItems = items.filter(li => li.day === day);
            const dayTotal = byDay[day] ?? 0;
            return (
              <div key={day} className="border border-stone-200 bg-white">
                <div className="bg-stone-100 border-b border-stone-200 px-4 py-2 flex items-center justify-between">
                  <h4 className="text-sm font-medium text-emerald-900 uppercase tracking-wider">Day {idx + 1} — {fmtDate(day)}</h4>
                  <div className="text-sm font-medium">Subtotal: ₹{dayTotal.toLocaleString('en-IN')}</div>
                </div>
                {dayItems.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-stone-400 italic">No line items. Add from catalogue or custom.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-xs text-stone-600 uppercase">
                      <tr><th className="text-left p-2 w-2/5">Particular</th><th className="text-right p-2 w-20">Rate (₹)</th><th className="text-right p-2 w-16">No. of Pax</th><th className="text-right p-2 w-16">No. of Rooms</th><th className="text-right p-2 w-24">Total</th><th className="w-8"></th></tr>
                    </thead>
                    <tbody>
                      {dayItems.map(li => (
                        <tr key={li._id} className="border-t border-stone-100">
                          <td className="p-2"><input value={li.particular} onChange={e => updateItem(li._id, 'particular', e.target.value)} className="w-full px-2 py-1 border border-stone-200 text-sm bg-white outline-none" /></td>
                          <td className="p-2"><NumberInput value={li.rate} min={0} onChange={n => updateItem(li._id, 'rate', String(n))} className="w-full px-2 py-1 border border-stone-200 text-sm text-right bg-white outline-none" /></td>
                          <td className="p-2"><NumberInput value={li.qty} min={0} onChange={n => updateItem(li._id, 'qty', String(n))} className="w-full px-2 py-1 border border-stone-200 text-sm text-right bg-white outline-none" /></td>
                          <td className="p-2"><NumberInput value={li.units} min={0} onChange={n => updateItem(li._id, 'units', String(n))} className="w-full px-2 py-1 border border-stone-200 text-sm text-right bg-white outline-none" /></td>
                          <td className="p-2 text-right font-medium">₹{(Number(li.rate ?? 0) * Number(li.qty ?? 1)).toLocaleString('en-IN')}</td>
                          <td className="p-2"><button onClick={() => removeItem(li._id)} className="p-1 hover:bg-red-100 text-red-600 rounded"><Trash2 size={12} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="border-t border-stone-200 px-4 py-2 bg-stone-50/50 flex gap-2 flex-wrap">
                  <div className="relative">
                    <button onClick={() => setShowCatalogue(showCatalogue === day ? null : day)} className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 flex items-center gap-1"><Plus size={12} /> FROM CATALOGUE</button>
                    {showCatalogue === day && (
                      <div className="absolute top-full left-0 z-50 bg-white border border-stone-200 shadow-lg p-3 w-96 max-h-64 overflow-y-auto">
                        {Object.entries(LINE_ITEM_CATALOGUE).map(([cat, catItems]) => (
                          <div key={cat} className="mb-3">
                            <div className="text-xs font-medium text-emerald-900 uppercase tracking-wider mb-1">{cat}</div>
                            <div className="flex flex-col gap-0.5">
                              {catItems.map(item => (
                                <button key={item.name} onClick={() => addFromCatalogue(day, `Day ${idx + 1}`, item, cat)}
                                  className="text-xs text-left bg-stone-50 hover:bg-emerald-50 px-2 py-1 border border-stone-100">
                                  {item.name} <span className="text-stone-400">₹{item.defaultRate}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => addItem(day, `Day ${idx + 1}`)} className="text-xs bg-stone-600 hover:bg-stone-700 text-white px-3 py-1.5 flex items-center gap-1"><Plus size={12} /> CUSTOM ITEM</button>
                </div>
              </div>
            );
          })}

          {/* Multi-day section */}
          <div className="border border-stone-200 bg-white">
            <div className="bg-stone-100 border-b border-stone-200 px-4 py-2 flex items-center justify-between">
              <h4 className="text-sm font-medium text-emerald-900 uppercase tracking-wider">Multi-Day / Equipment</h4>
              <div className="text-sm font-medium">Subtotal: ₹{(byDay['multi'] ?? 0).toLocaleString('en-IN')}</div>
            </div>
            {items.filter(li => !li.day || li.day === 'multi').length === 0 ? (
              <div className="px-4 py-3 text-sm text-stone-400 italic">No items</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {items.filter(li => !li.day || li.day === 'multi').map(li => (
                    <tr key={li._id} className="border-t border-stone-100">
                      <td className="p-2 w-2/5"><input value={li.particular} onChange={e => updateItem(li._id, 'particular', e.target.value)} className="w-full px-2 py-1 border border-stone-200 text-sm bg-white outline-none" /></td>
                      <td className="p-2"><NumberInput value={li.rate} min={0} onChange={n => updateItem(li._id, 'rate', String(n))} className="w-24 px-2 py-1 border border-stone-200 text-sm text-right bg-white outline-none" /></td>
                      <td className="p-2 text-right font-medium">₹{(Number(li.rate ?? 0) * Number(li.qty ?? 1)).toLocaleString('en-IN')}</td>
                      <td className="p-2"><button onClick={() => removeItem(li._id)} className="p-1 hover:bg-red-100 text-red-600 rounded"><Trash2 size={12} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="border-t border-stone-200 px-4 py-2 bg-stone-50/50">
              <button onClick={() => addItem('multi', 'Multi-Day')} className="text-xs bg-stone-600 hover:bg-stone-700 text-white px-3 py-1.5 flex items-center gap-1"><Plus size={12} /> ADD ITEM</button>
            </div>
          </div>

          {/* Grand total */}
          <div className="bg-emerald-900 text-amber-100 px-5 py-4 flex justify-between items-center">
            <span className="text-xs uppercase tracking-widest">Grand Total</span>
            <span style={{ fontFamily: "'Cormorant Garamond', serif" }} className="text-2xl font-semibold">₹{grandTotal.toLocaleString('en-IN')}</span>
          </div>

          {/* Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Terms</label><textarea value={terms} onChange={e => setTerms(e.target.value)} rows={3} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center pt-4 border-t border-stone-300">
            <div className="text-xs text-stone-500 italic">
              {booking.costSheet?.version && <span>Version {booking.costSheet.version} · </span>}
              {booking.costSheet?.sentAt && <span className="text-blue-700">Sent {fmtDate(booking.costSheet.sentAt)} · </span>}
              {booking.costSheet?.acceptedAt && <span className="text-purple-700">Accepted {fmtDate(booking.costSheet.acceptedAt)}</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm border border-stone-300 hover:bg-stone-100 tracking-wider">CLOSE</button>
              <button
                onClick={() => { const w = window.open(`/api/print/cost-sheet?bookingId=${booking.id}`, '_blank'); w?.addEventListener('load', () => setTimeout(() => w.print(), 300)); }}
                className="px-4 py-2 text-sm border border-emerald-700 text-emerald-800 hover:bg-emerald-50 tracking-wider flex items-center gap-1.5"
                title="Open the saved cost sheet as a printable PDF"
              >
                <Printer size={13} /> PDF
              </button>
              <button onClick={handleSaveDraft} disabled={isPending} className="px-5 py-2 text-sm bg-stone-700 hover:bg-stone-800 text-white tracking-wider disabled:opacity-50">SAVE DRAFT</button>
              {(stage === 'inquiry' || stage === 'cost_sheet_draft') && <button onClick={handleSaveAndSend} disabled={isPending} className="px-5 py-2 text-sm bg-blue-700 hover:bg-blue-800 text-white tracking-wider disabled:opacity-50">SAVE & MARK SENT</button>}
              {stage === 'cost_sheet_sent' && <button onClick={handleSaveAndAccept} disabled={isPending} className="px-5 py-2 text-sm bg-purple-700 hover:bg-purple-800 text-white tracking-wider disabled:opacity-50">SAVE & MARK ACCEPTED</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
