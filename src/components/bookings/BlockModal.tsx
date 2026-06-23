'use client';

import { useState, useTransition, useMemo } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { createBlockedRoom, updateBooking } from '@/lib/actions/bookings';
import { blockEnquiryRooms } from '@/lib/actions/enquiries';
import { ROOM_INVENTORY } from '@/lib/constants/rooms';
import { datesInRange, isoDate, daysBetween, todayISO, addDays, fmtDate } from '@/lib/utils/date';
import { isValidPhone, PHONE_ERROR } from '@/lib/validations/phone';
import { DateInput } from '@/components/ui/DateInput';
import { NumberInput } from '@/components/ui/NumberInput';
import { AddOnsEditor } from '@/components/bookings/AddOnsEditor';
import { RoomChargesEditor, seedRoomCharges } from '@/components/bookings/RoomChargesEditor';
import { addOnsTotal, roomChargesTotal } from '@/lib/utils/booking';
import type { Booking } from '@/lib/types/booking';

interface Props {
  currentUser: { name: string; role: string };
  existingBookings: Booking[];
  booking?: Booking;
  enquiry?: { id: string; name: string; phone: string; preferredDates?: string };
  onConvert?: (hold: Booking) => void;
  onBlocked?: () => void;
  onClose: () => void;
}

// datetime-local needs "YYYY-MM-DDTHH:mm" in the user's local time
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function BlockModal({ currentUser, existingBookings, booking, enquiry, onConvert, onBlocked, onClose }: Props) {
  const today = todayISO();
  const isEdit = !!booking;
  const [isPending, startTransition] = useTransition();

  const seedName = booking?.guestName ?? enquiry?.name ?? '';
  const seedPhone = booking?.contactNumber ?? enquiry?.phone ?? '';
  // Blocking straight from an enquiry: do NOT default the check-in to today. The
  // enquiry's intended dates live only in free-text `preferredDates`, so a future
  // stay would silently land on today's date if left at the default. Force the
  // user to pick the date deliberately (empty seed + validation below).
  const isEnquiryBlock = !!enquiry && !booking;

  // Lazy initializer: the impure date math runs once at mount, not on every render.
  const [form, setForm] = useState(() => {
    const defaultExpiry = new Date(Date.now() + 48 * 3600000);
    const localExpiry = new Date(defaultExpiry.getTime() - defaultExpiry.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    return {
      guestName: seedName,
      contactNumber: seedPhone,
      arrival: booking?.arrival ?? (isEnquiryBlock ? '' : today),
      departure: booking?.departure ?? (isEnquiryBlock ? '' : isoDate(new Date(Date.now() + 86400000))),
      adults: booking?.adults ?? 2,
      children: booking?.children ?? 0,
      rooms: booking?.rooms ?? ([] as string[]),
      // Blank by default (not 0): an empty quote ≠ a quote of zero. Stored total is the
      // grand total (package + add-ons); show only the package portion here.
      quotedAmount: booking?.totalAmount ? String(booking.totalAmount - addOnsTotal(booking.addOns ?? [])) : '',
      advanceRequired: booking?.advanceRequired ? String(booking.advanceRequired) : '',
      addOns: booking?.addOns ?? ([] as Booking['addOns']),
      roomCharges: booking?.roomCharges ?? ([] as Booking['roomCharges']),
      notes: booking?.remarks ?? '',
      holdExpiresAt: booking ? toLocalInput(booking.holdExpiresAt) : localExpiry,
    };
  });

  // Nights is derived from the dates — compute in render, no effect/synced state.
  const nights = daysBetween(form.arrival, form.departure);
  // Room charges auto-seed from the selected rooms until the user edits them.
  const [roomTouched, setRoomTouched] = useState((booking?.roomCharges?.length ?? 0) > 0);

  const autoRoomCharges = seedRoomCharges(form.rooms, nights);
  const roomCharges = roomTouched ? form.roomCharges : autoRoomCharges;
  const roomSum = roomChargesTotal(roomCharges);

  // A typed quote overrides the room-charges sum; add-ons roll in to form the grand total.
  const blockQuoted = form.quotedAmount.trim() === '' ? roomSum : (Number(form.quotedAmount) || 0);
  const blockAddOnsSum = addOnsTotal(form.addOns);
  const blockGrand = blockQuoted + blockAddOnsSum;

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  // Changing arrival defaults departure to the next day when it's empty or no
  // longer after arrival. A longer stay is preserved; user can still override.
  const handleArrivalChange = (v: string) =>
    setForm(f => ({ ...f, arrival: v, departure: (!f.departure || f.departure <= v) ? addDays(v, 1) : f.departure }));

  const toggleRoom = (room: string) => {
    setForm(f => ({ ...f, rooms: f.rooms.includes(room) ? f.rooms.filter(r => r !== room) : [...f.rooms, room] }));
  };

  const occupiedRooms = useMemo(() => {
    const ranges = datesInRange(form.arrival, form.departure);
    const set = new Set<string>();
    existingBookings.filter(b => b.id !== booking?.id).forEach(b => {
      const bDates = datesInRange(b.arrival, b.departure);
      if (bDates.some(d => ranges.includes(d))) (b.rooms ?? []).forEach(r => set.add(r));
    });
    return set;
  }, [form.arrival, form.departure, existingBookings, booking?.id]);

  const setExpiry = (hrs: number) => {
    const d = new Date(Date.now() + hrs * 3600000);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    update('holdExpiresAt', local);
  };

  const handleSave = () => {
    if (!form.guestName.trim()) { toast.error('Guest name is required'); return; }
    if (!form.contactNumber.trim()) { toast.error('Contact number is required'); return; }
    if (!isValidPhone(form.contactNumber)) { toast.error(PHONE_ERROR); return; }
    if (!form.arrival) { toast.error('Select the check-in date'); return; }
    if (!form.departure) { toast.error('Select the check-out date'); return; }
    if (form.rooms.length === 0) { toast.error('Select at least one room to block'); return; }
    if (nights < 1) { toast.error('Departure must be after arrival'); return; }
    const quoted = form.quotedAmount.trim() === '' ? roomSum : Number(form.quotedAmount);
    if (Number.isNaN(quoted) || quoted < 0) { toast.error('Quoted amount must be a positive number'); return; }
    const cleanAddOns = form.addOns.filter(a => a.name.trim() !== '' || a.total > 0);
    const cleanRoomCharges = roomCharges.filter(r => (Number(r.total) || 0) > 0 || r.roomType.trim() !== '');
    const grand = quoted + addOnsTotal(cleanAddOns);
    const advReq = form.advanceRequired.trim() === '' ? 0 : Math.max(0, Number(form.advanceRequired) || 0);

    startTransition(async () => {
      if (isEdit && booking) {
        // Spread the full hold and override only the block-editable fields, so
        // bookingToDb (which fills `||` defaults) can't clobber unrelated columns.
        const result = await updateBooking(booking.id, {
          ...booking,
          guestName: form.guestName,
          contactNumber: form.contactNumber,
          arrival: form.arrival,
          departure: form.departure,
          nights: nights,
          adults: form.adults,
          children: form.children,
          rooms: form.rooms,
          totalAmount: grand,
          addOns: cleanAddOns,
          roomCharges: cleanRoomCharges,
          advanceRequired: advReq,
          remarks: form.notes,
          holdExpiresAt: form.holdExpiresAt || null,
          status: 'hold',
        });
        if (!result.success) { toast.error(result.error); return; }
        toast.success('Hold updated');
      } else if (enquiry) {
        const result = await blockEnquiryRooms(enquiry.id, {
          arrival: form.arrival, departure: form.departure, nights: nights,
          adults: form.adults, children: form.children, rooms: form.rooms,
          quotedAmount: grand, advanceRequired: advReq, addOns: cleanAddOns, roomCharges: cleanRoomCharges, notes: form.notes, holdExpiresAt: form.holdExpiresAt || null,
        });
        if (!result.success) { toast.error(result.error); return; }
        toast.success(`Rooms blocked: ${result.data.confirmationNumber}`);
        onBlocked?.();
      } else {
        const result = await createBlockedRoom({ ...form, nights, quotedAmount: grand, advanceRequired: advReq, addOns: cleanAddOns, roomCharges: cleanRoomCharges, createdBy: currentUser.name });
        if (!result.success) { toast.error(result.error); return; }
        toast.success(`Rooms blocked: ${result.data.confirmationNumber}`);
      }
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-stone-50 max-w-3xl w-full my-8 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-amber-600 text-white px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">{isEdit ? 'Edit Hold' : 'Block Rooms'}</h2>
            <p className="text-xs text-amber-100 italic mt-0.5">{isEdit && booking ? `${booking.confirmationNumber} · update the hold or convert it to a booking` : 'Hold rooms tentatively until guest pays'}</p>
          </div>
          <button onClick={onClose} className="hover:bg-amber-700 p-1 rounded"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Guest Name *</label><input value={form.guestName} onChange={e => update('guestName', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Contact Number *</label><input type="tel" inputMode="tel" maxLength={20} value={form.contactNumber} onChange={e => update('contactNumber', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
          </div>
          {isEnquiryBlock && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900">
              {enquiry?.preferredDates
                ? <>Guest&apos;s preferred dates: <strong className="not-italic">{fmtDate(enquiry.preferredDates)}</strong> — set the check-in &amp; check-out below to match.</>
                : <>Set the guest&apos;s actual check-in &amp; check-out below — it does not default to today.</>}
            </div>
          )}
          <div className="grid grid-cols-5 gap-3">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Arrival</label><DateInput value={form.arrival} onChange={v => handleArrivalChange(v)} className="w-full" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Departure</label><DateInput value={form.departure} min={form.arrival} onChange={v => update('departure', v)} className="w-full" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Nights</label><input type="number" value={Number.isFinite(nights) ? nights : ''} readOnly className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-stone-100" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Adults</label><NumberInput value={form.adults} min={0} onChange={n => update('adults', n)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Children</label><NumberInput value={form.children} min={0} onChange={n => update('children', n)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
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

          <div className="border border-stone-200 bg-white p-3">
            <RoomChargesEditor value={roomCharges} onChange={rows => { setRoomTouched(true); update('roomCharges', rows); }} />
            {!roomTouched && form.rooms.length > 0 && (
              <p className="text-xs italic mt-1.5 text-stone-500">Auto-filled from the selected rooms — edit any cell to customise.</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Quoted Amount (₹) — overrides room charges</label><input type="number" min="0" value={form.quotedAmount} onChange={e => update('quotedAmount', e.target.value)} placeholder={roomSum > 0 ? `₹${roomSum.toLocaleString('en-IN')} (auto)` : '—'} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Advance to be Paid (₹)</label><input type="number" min="0" value={form.advanceRequired} onChange={e => update('advanceRequired', e.target.value)} placeholder="Deposit to confirm" className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Quick Note</label><input value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="e.g. 'Will pay by Friday'" className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
          </div>

          <div className="border border-stone-200 bg-white p-3">
            <AddOnsEditor value={form.addOns} onChange={v => update('addOns', v)} />
            <div className="text-xs text-right text-stone-600 mt-2">
              Rooms ₹{blockQuoted.toLocaleString('en-IN')}{blockAddOnsSum > 0 ? ` + Add-ons ₹${blockAddOnsSum.toLocaleString('en-IN')}` : ''} ={' '}
              <strong className="text-stone-900">₹{blockGrand.toLocaleString('en-IN')}</strong>
            </div>
          </div>

          {!isEdit && (
            <div className="bg-emerald-50 border-l-4 border-emerald-700 p-3 text-xs text-stone-700 italic">
              When the guest pays, open the booking and convert this hold into a confirmed booking. You will add full details at that point.
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-stone-300">
            <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 transition tracking-wider">CANCEL</button>
            {isEdit && booking && onConvert && (
              <button onClick={() => onConvert(booking)} disabled={isPending} className="px-6 py-2.5 text-sm bg-emerald-900 hover:bg-emerald-800 text-amber-100 transition tracking-wider disabled:opacity-50">
                CONVERT TO BOOKING
              </button>
            )}
            <button onClick={handleSave} disabled={isPending} className="px-6 py-2.5 text-sm bg-amber-600 hover:bg-amber-700 text-white transition tracking-wider disabled:opacity-50">
              {isPending ? 'SAVING…' : isEdit ? 'UPDATE HOLD' : 'BLOCK ROOMS'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
