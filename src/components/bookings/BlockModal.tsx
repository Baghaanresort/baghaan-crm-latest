'use client';

import { useState, useTransition, useMemo, useEffect } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { createBlockedRoom } from '@/lib/actions/bookings';
import { ROOM_INVENTORY } from '@/lib/constants/rooms';
import { datesInRange, isoDate, daysBetween, todayISO } from '@/lib/utils/date';
import type { Booking } from '@/lib/types/booking';

interface Props {
  currentUser: { name: string; role: string };
  existingBookings: Booking[];
  onClose: () => void;
}

export function BlockModal({ currentUser, existingBookings, onClose }: Props) {
  const today = todayISO();
  const [isPending, startTransition] = useTransition();

  const defaultExpiry = new Date(Date.now() + 48 * 3600000);
  const localExpiry = new Date(defaultExpiry.getTime() - defaultExpiry.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const [form, setForm] = useState({
    guestName: '',
    contactNumber: '',
    arrival: today,
    departure: isoDate(new Date(Date.now() + 86400000)),
    nights: 1,
    adults: 2,
    children: 0,
    rooms: [] as string[],
    quotedAmount: 0,
    notes: '',
    holdExpiresAt: localExpiry,
  });

  useEffect(() => {
    const n = daysBetween(form.arrival, form.departure);
    if (n !== form.nights) setForm(f => ({ ...f, nights: n }));
  }, [form.arrival, form.departure]);

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const toggleRoom = (room: string) => {
    setForm(f => ({ ...f, rooms: f.rooms.includes(room) ? f.rooms.filter(r => r !== room) : [...f.rooms, room] }));
  };

  const occupiedRooms = useMemo(() => {
    const ranges = datesInRange(form.arrival, form.departure);
    const set = new Set<string>();
    existingBookings.forEach(b => {
      const bDates = datesInRange(b.arrival, b.departure);
      if (bDates.some(d => ranges.includes(d))) (b.rooms ?? []).forEach(r => set.add(r));
    });
    return set;
  }, [form.arrival, form.departure, existingBookings]);

  const setExpiry = (hrs: number) => {
    const d = new Date(Date.now() + hrs * 3600000);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    update('holdExpiresAt', local);
  };

  const handleSave = () => {
    if (!form.guestName.trim()) { toast.error('Guest name is required'); return; }
    if (!form.contactNumber.trim()) { toast.error('Contact number is required'); return; }
    if (form.rooms.length === 0) { toast.error('Select at least one room to block'); return; }
    if (form.nights < 1) { toast.error('Departure must be after arrival'); return; }

    startTransition(async () => {
      const result = await createBlockedRoom({ ...form, createdBy: currentUser.name });
      if (!result.success) { toast.error(result.error); return; }
      toast.success(`Rooms blocked: ${result.data.confirmationNumber}`);
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-stone-50 max-w-3xl w-full my-8 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-amber-600 text-white px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">Block Rooms</h2>
            <p className="text-xs text-amber-100 italic mt-0.5">Hold rooms tentatively until guest pays</p>
          </div>
          <button onClick={onClose} className="hover:bg-amber-700 p-1 rounded"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Guest Name *</label><input value={form.guestName} onChange={e => update('guestName', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Contact Number *</label><input value={form.contactNumber} onChange={e => update('contactNumber', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
          </div>
          <div className="grid grid-cols-5 gap-3">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Arrival</label><input type="date" value={form.arrival} onChange={e => update('arrival', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Departure</label><input type="date" value={form.departure} onChange={e => update('departure', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Nights</label><input type="number" value={form.nights} readOnly className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-stone-100" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Adults</label><input type="number" value={form.adults} onChange={e => update('adults', Number(e.target.value))} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Children</label><input type="number" value={form.children} onChange={e => update('children', Number(e.target.value))} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
          </div>

          {/* Rooms */}
          <div>
            <h3 className="text-sm uppercase tracking-wider text-emerald-900 border-b border-stone-300 pb-1.5 mb-3">Rooms to Block</h3>
            <p className="text-xs text-stone-500 italic mb-3">Greyed-out rooms are already taken in these dates</p>
            {Object.entries(ROOM_INVENTORY).map(([cat, rooms]) => (
              <div key={cat} className="mb-3">
                <h4 className="text-xs font-medium text-emerald-900 uppercase tracking-wider mb-1.5">{cat}</h4>
                <div className="flex flex-wrap gap-1.5">
                  {rooms.map(r => {
                    const isSelected = form.rooms.includes(r);
                    const isOccupied = occupiedRooms.has(r);
                    const label = cat === 'Kothi' ? r.split(' ')[0] : (r.match(/\d+/)?.[0] ?? r);
                    return (
                      <button key={r} type="button" onClick={() => !isOccupied && toggleRoom(r)} disabled={isOccupied} title={r + (isOccupied ? ' (Taken)' : '')}
                        className={`${cat === 'Kothi' ? 'px-3 text-xs' : 'w-9'} h-9 text-xs border transition ${isSelected ? 'bg-amber-500 text-white border-amber-600' : isOccupied ? 'bg-stone-200 text-stone-400 border-stone-200 cursor-not-allowed line-through' : 'bg-white border-stone-300 hover:border-amber-500 hover:bg-amber-50'}`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="text-sm text-stone-700 mt-2 bg-stone-100 px-3 py-2 italic">
              Blocking <strong className="not-italic">{form.rooms.length}</strong> {form.rooms.length === 1 ? 'room' : 'rooms'}
            </div>
          </div>

          {/* Hold expiry */}
          <div className="bg-amber-50 border-l-4 border-amber-500 p-3">
            <label className="text-xs text-stone-700 uppercase tracking-wider block mb-1.5 font-medium">Hold Expires On</label>
            <input type="datetime-local" value={form.holdExpiresAt ?? ''} onChange={e => update('holdExpiresAt', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" />
            <div className="flex gap-2 mt-2">
              {[['+24h', 24], ['+48h', 48], ['+72h', 72], ['+7 days', 168]].map(([label, hrs]) => (
                <button key={String(label)} type="button" onClick={() => setExpiry(Number(hrs))}
                  className="text-xs bg-white border border-amber-500 text-amber-800 px-3 py-1 hover:bg-amber-100">{label}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Quoted Amount (₹) — optional</label><input type="number" value={form.quotedAmount} onChange={e => update('quotedAmount', Number(e.target.value))} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Quick Note</label><input value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="e.g. 'Will pay by Friday'" className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
          </div>

          <div className="bg-emerald-50 border-l-4 border-emerald-700 p-3 text-xs text-stone-700 italic">
            When the guest pays, open the booking and convert this hold into a confirmed booking. You'll add full details at that point.
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-stone-300">
            <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 transition tracking-wider">CANCEL</button>
            <button onClick={handleSave} disabled={isPending} className="px-6 py-2.5 text-sm bg-amber-600 hover:bg-amber-700 text-white transition tracking-wider disabled:opacity-50">
              {isPending ? 'SAVING…' : 'BLOCK ROOMS'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
