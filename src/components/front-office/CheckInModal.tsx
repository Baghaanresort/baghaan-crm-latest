'use client';

import { useState } from 'react';
import { X, LogIn } from 'lucide-react';
import { NumberInput } from '@/components/ui/NumberInput';
import type { Booking } from '@/lib/types/booking';
import type { CheckInDetailsInput } from '@/lib/validations/booking';

// Front-office check-in form: captures the actual party (by age band) and the rooms
// assigned at the desk, then flips the booking to checked-in (In-House).
export function CheckInModal({ booking, onConfirm, onClose, isPending }: {
  booking: Booking;
  onConfirm: (details: CheckInDetailsInput) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<CheckInDetailsInput>({
    adults: booking.adults ?? 0,
    childBelow6: 0,
    child6to12: 0,
    child12to18: 0,
    roomsAssigned: booking.rooms?.length ?? 0,
    roomNumbers: booking.rooms ?? [],
  });
  const [roomsText, setRoomsText] = useState((booking.rooms ?? []).join(', '));

  const update = <K extends keyof CheckInDetailsInput>(k: K, v: CheckInDetailsInput[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const totalGuests = form.adults + form.childBelow6 + form.child6to12 + form.child12to18;

  const submit = () => {
    const roomNumbers = roomsText.split(',').map(s => s.trim()).filter(Boolean);
    onConfirm({ ...form, roomNumbers, roomsAssigned: form.roomsAssigned || roomNumbers.length });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-stone-50 max-w-lg w-full my-8">
        <div className="sticky top-0 bg-emerald-900 text-white px-6 py-4 flex justify-between items-center">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">Check In Guest</h2>
            <p className="text-xs text-stone-300 mt-0.5">{booking.confirmationNumber} · {booking.guestName}</p>
          </div>
          <button onClick={onClose} className="hover:bg-emerald-800 p-1.5 rounded"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-stone-600 uppercase tracking-wider">Number of Guests</label>
              <span className="text-xs text-stone-500">Total: <strong className="text-stone-800">{totalGuests}</strong></span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Counter label="Adults" value={form.adults} onChange={v => update('adults', v)} />
              <Counter label="Child (below 6)" value={form.childBelow6} onChange={v => update('childBelow6', v)} />
              <Counter label="Child (6–12)" value={form.child6to12} onChange={v => update('child6to12', v)} />
              <Counter label="Child (12–18)" value={form.child12to18} onChange={v => update('child12to18', v)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Counter label="Rooms Assigned" value={form.roomsAssigned} onChange={v => update('roomsAssigned', v)} />
          </div>

          <div>
            <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Room Numbers</label>
            <input
              value={roomsText}
              onChange={e => setRoomsText(e.target.value)}
              placeholder="e.g. Orchard Cottage 3, Kesar Khema 5"
              className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white"
            />
            <p className="text-xs text-stone-400 italic mt-1">Comma-separated. Pre-filled from the booking; adjust if rooms changed at the desk.</p>
          </div>
        </div>

        <div className="px-6 py-4 bg-stone-100 border-t border-stone-200 flex justify-end gap-2">
          <button onClick={onClose} disabled={isPending} className="px-4 py-2 text-sm border border-stone-300 text-stone-600 hover:bg-stone-50 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={isPending} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50">
            <LogIn size={14} /> {isPending ? 'CHECKING IN…' : 'CONFIRM CHECK-IN'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs text-stone-500 block mb-1">{label}</label>
      <NumberInput value={value} min={0} onChange={onChange}
        className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white" />
    </div>
  );
}
