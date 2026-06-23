'use client';

import { useState, useTransition, useMemo } from 'react';
import { X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { createBooking, updateBooking } from '@/lib/actions/bookings';
import { updateVoucher } from '@/lib/actions/vouchers';
import { markEnquiryConverted } from '@/lib/actions/enquiries';
import { ROOM_INVENTORY } from '@/lib/constants/rooms';
import { datesInRange, isoDate, daysBetween, todayISO, addDays } from '@/lib/utils/date';
import { isValidPhone, PHONE_ERROR } from '@/lib/validations/phone';
import { DateInput } from '@/components/ui/DateInput';
import { NumberInput } from '@/components/ui/NumberInput';
import { AddOnsEditor } from '@/components/bookings/AddOnsEditor';
import { RoomChargesEditor, seedRoomCharges } from '@/components/bookings/RoomChargesEditor';
import { addOnsTotal, roomChargesTotal } from '@/lib/utils/booking';
import type { Booking } from '@/lib/types/booking';

interface Props {
  booking?: Booking;
  users: Array<{ name: string; role: string }>;
  currentUser: { name: string; role: string };
  existingBookings: Booking[];
  prefill?: { guestName?: string; contactNumber?: string; email?: string; remarks?: string } | null;
  sourceEnquiryId?: string | null;
  convertFromHold?: boolean;
  voucherEdit?: boolean;
  onClose: () => void;
}

export function BookingModal({ booking, users, currentUser, existingBookings, prefill, sourceEnquiryId, convertFromHold, voucherEdit, onClose }: Props) {
  const isEdit = !!booking;
  const today = todayISO();
  const [isPending, startTransition] = useTransition();

  // Lazy initializer keeps the impure date math (new Date) out of the render body.
  const [form, setForm] = useState(() => {
    const defaultArrival = isoDate(new Date());
    const defaultDeparture = isoDate(new Date(Date.now() + 86400000));
    return {
      guestName: booking?.guestName ?? prefill?.guestName ?? '',
      contactNumber: booking?.contactNumber ?? prefill?.contactNumber ?? '',
      email: booking?.email ?? prefill?.email ?? '',
      companyName: booking?.companyName ?? '',
      gstNumber: booking?.gstNumber ?? '',
      arrival: booking?.arrival ?? defaultArrival,
      departure: booking?.departure ?? defaultDeparture,
      adults: booking?.adults ?? 2,
      children: booking?.children ?? 0,
      rooms: booking?.rooms ?? ([] as string[]),
      rateBreakdown: booking?.rateBreakdown ?? '',
      // Stored totalAmount is the grand total (room charges + add-ons); the field edits it directly.
      totalAmount: booking?.totalAmount ?? 0,
      addOns: (booking?.addOns ?? []) as Booking['addOns'],
      roomCharges: (booking?.roomCharges ?? []) as Booking['roomCharges'],
      advancePaid: booking?.advancePaid ?? 0,
      advanceRequired: booking?.advanceRequired ?? 0,
      inclusions: booking?.inclusions ?? '',
      remarks: booking?.remarks ?? prefill?.remarks ?? '',
      specialRequests: booking?.specialRequests ?? '',
      createdBy: booking?.createdBy ?? currentUser.name,
      status: (convertFromHold ? 'confirmed' : (booking?.status ?? 'confirmed')) as 'confirmed' | 'hold',
      holdExpiresAt: booking?.holdExpiresAt ?? null,
    };
  });

  // Nights is derived from the dates — computed in render, not stored/synced.
  const nights = daysBetween(form.arrival, form.departure);

  // Once a total already exists (editing a saved booking, or a hold being converted)
  // we treat the rate as user-owned and never auto-overwrite it. New bookings start
  // in auto mode so the tariff fills itself from the room selection.
  const [rateTouched, setRateTouched] = useState((booking?.totalAmount ?? 0) > 0);
  // Room charges auto-seed from the selected rooms until the user edits them by hand.
  const [roomTouched, setRoomTouched] = useState((booking?.roomCharges?.length ?? 0) > 0);

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  // Changing arrival defaults departure to the next day when it's empty or no
  // longer after arrival. A longer stay is preserved; user can still override.
  const handleArrivalChange = (v: string) =>
    setForm(f => ({ ...f, arrival: v, departure: (!f.departure || f.departure <= v) ? addDays(v, 1) : f.departure }));

  const occupiedRooms = useMemo(() => {
    const ranges = datesInRange(form.arrival, form.departure);
    const set = new Set<string>();
    existingBookings.forEach(b => {
      if (b.id === booking?.id) return;
      const bDates = datesInRange(b.arrival, b.departure);
      if (bDates.some(d => ranges.includes(d))) {
        (b.rooms ?? []).forEach(r => set.add(r));
      }
    });
    return set;
  }, [form.arrival, form.departure, existingBookings, booking?.id]);

  const toggleRoom = (room: string) => {
    setForm(f => ({
      ...f,
      rooms: f.rooms.includes(room) ? f.rooms.filter(r => r !== room) : [...f.rooms, room],
    }));
  };

  // Room charges itemised from the selected rooms (auto-seeded), still editable.
  const autoRoomCharges = seedRoomCharges(form.rooms, nights);
  const roomCharges = roomTouched ? form.roomCharges : autoRoomCharges;
  const roomSum = roomChargesTotal(roomCharges);

  // Add-ons roll in alongside the room charges to form the package total.
  const addOnsSum = addOnsTotal(form.addOns);
  const autoGrand = roomSum + addOnsSum;
  const autoBreakdown =
    roomCharges.map(r => `${r.numberOfRooms}× ${r.roomType || 'Room'} @ ₹${(Number(r.roomPrice) || 0).toLocaleString('en-IN')}`).join(' · ')
    || `${form.rooms.length} room(s) × ${nights} night(s)`;

  // Until the user overrides it, the total follows the auto sum. Derived in render.
  const displayTotal = rateTouched ? form.totalAmount : autoGrand;
  const displayBreakdown = rateTouched ? form.rateBreakdown : autoBreakdown;

  // First manual edit: commit the current auto values into state, then apply the edit
  // (so switching a custom breakdown doesn't wipe the total, and vice-versa).
  const enterManual = () => {
    if (!rateTouched) {
      setForm(f => ({ ...f, totalAmount: autoGrand, rateBreakdown: autoBreakdown }));
      setRateTouched(true);
    }
  };
  const resetToAuto = () => setRateTouched(false);

  const allAgents = useMemo(() => Array.from(new Set([currentUser.name, ...users.map(u => u.name)])).filter(Boolean), [users, currentUser.name]);

  const handleSave = () => {
    if (!form.guestName.trim()) { toast.error('Guest name is required'); return; }
    if (!form.contactNumber.trim()) { toast.error('Contact number is required'); return; }
    if (!isValidPhone(form.contactNumber)) { toast.error(PHONE_ERROR); return; }
    if (form.rooms.length === 0) { toast.error('Select at least one room'); return; }
    if (nights < 1) { toast.error('Departure must be after arrival'); return; }

    // nights is derived; totalAmount/rateBreakdown follow the auto calc until overridden.
    const payload = {
      ...form,
      nights,
      totalAmount: displayTotal,
      rateBreakdown: displayBreakdown,
      roomCharges: roomCharges.filter(r => (Number(r.total) || 0) > 0 || r.roomType.trim() !== ''),
      addOns: form.addOns.filter(a => a.name.trim() !== '' || a.total > 0),
      advanceRequired: form.status === 'hold' ? Math.max(0, form.advanceRequired || 0) : 0,
      bookingType: 'regular' as const,
    };

    startTransition(async () => {
      if (isEdit) {
        const result = voucherEdit
          ? await updateVoucher(booking.id, payload)
          : await updateBooking(booking.id, payload);
        if (!result.success) { toast.error(result.error); return; }
        toast.success(voucherEdit ? 'Voucher updated' : 'Reservation updated');
      } else {
        const result = await createBooking(payload);
        if (!result.success) { toast.error(result.error); return; }
        if (sourceEnquiryId) {
          await markEnquiryConverted(sourceEnquiryId, result.data.id, result.data.confirmationNumber);
        }
        toast.success(`Reservation confirmed: ${result.data.confirmationNumber}`);
      }
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-stone-50 max-w-4xl w-full my-8 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-emerald-900 text-white px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">
              {convertFromHold ? 'Convert Hold to Booking' : voucherEdit ? 'Edit Voucher' : isEdit ? 'Edit Reservation' : 'New Reservation'}
            </h2>
            {booking && <p className="text-xs text-stone-300 mt-0.5 font-mono">{booking.confirmationNumber}</p>}
            {convertFromHold && (
              <p className="text-xs text-amber-300 mt-0.5">↗ Confirming a blocked hold — review details and save</p>
            )}
            {!isEdit && sourceEnquiryId && (
              <p className="text-xs text-amber-300 mt-0.5">↙ Converting from lead</p>
            )}
          </div>
          <button onClick={onClose} className="hover:bg-emerald-800 p-1.5 rounded"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-6">

          {/* Guest Details */}
          <Section title="Guest Details">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Guest Name *" value={form.guestName} onChange={v => update('guestName', v)} />
              <Field label="Contact Number *" type="tel" value={form.contactNumber} onChange={v => update('contactNumber', v)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email" value={form.email} onChange={v => update('email', v)} type="email" />
              <Field label="Company Name" value={form.companyName} onChange={v => update('companyName', v)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="GST Number" value={form.gstNumber} onChange={v => update('gstNumber', v)} />
            </div>
          </Section>

          {/* Stay Details */}
          <Section title="Stay Details">
            <div className="grid grid-cols-5 gap-3">
              <Field label="Check-in" type="date" value={form.arrival} min={today} onChange={handleArrivalChange} />
              <Field label="Check-out" type="date" value={form.departure} min={form.arrival} onChange={v => update('departure', v)} />
              <Field label="Nights" type="number" value={nights} readOnly />
              <Field label="Adults" type="number" value={form.adults} min={0} onChange={v => update('adults', Number(v))} />
              <Field label="Children" type="number" value={form.children} min={0} onChange={v => update('children', Number(v))} />
            </div>
          </Section>

          {/* Reservation Status */}
          <Section title="Reservation Status">
            <div className="flex gap-2">
              {(['confirmed', 'hold'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => update('status', s)}
                  className={`px-4 py-2 text-xs tracking-wider border transition ${
                    form.status === s
                      ? s === 'confirmed'
                        ? 'bg-emerald-900 text-amber-100 border-emerald-900'
                        : 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white border-stone-300 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {s === 'confirmed' ? 'Confirmed' : 'On Hold'}
                </button>
              ))}
            </div>
            {form.status === 'hold' && (
              <div className="mt-3 max-w-xs">
                <Field label="Hold Expires At" type="datetime-local" value={form.holdExpiresAt ?? ''} onChange={v => update('holdExpiresAt', v || null)} />
              </div>
            )}
          </Section>

          {/* Room Selection */}
          <Section title="Room Selection">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-stone-500 italic">Greyed rooms are already reserved for these dates</p>
              <button onClick={resetToAuto} type="button" title="Recalculate the total from the selected rooms" className="text-xs border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-50 flex items-center gap-1.5 transition text-stone-600">
                <Zap size={11} /> Auto-rate
              </button>
            </div>
            {Object.entries(ROOM_INVENTORY).map(([cat, rooms]) => (
              <div key={cat} className="mb-3">
                <h4 className="text-xs font-medium text-stone-600 uppercase tracking-wider mb-1.5">{cat}</h4>
                <div className="flex flex-wrap gap-1.5">
                  {rooms.map(r => {
                    const isSelected = form.rooms.includes(r);
                    const isOccupied = occupiedRooms.has(r);
                    const label = cat === 'Kothi' ? r.split(' ')[0] : (r.match(/\d+/)?.[0] ?? r);
                    return (
                      <button key={r} type="button" onClick={() => !isOccupied && toggleRoom(r)} disabled={isOccupied} title={r + (isOccupied ? ' — Reserved' : '')}
                        className={`${cat === 'Kothi' ? 'px-3 text-xs' : 'w-9'} h-9 text-xs border transition ${
                          isSelected
                            ? 'bg-emerald-800 text-white border-emerald-800'
                            : isOccupied
                              ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed line-through'
                              : 'bg-white border-stone-300 hover:border-emerald-600 hover:bg-emerald-50'
                        }`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="text-xs text-stone-600 mt-2 bg-stone-100 px-3 py-2">
              <span className="text-stone-500">Selected:</span> <strong className="text-stone-800">{form.rooms.length}</strong> room{form.rooms.length !== 1 ? 's' : ''}
              {form.rooms.length > 0 && <span className="text-stone-400 ml-2">({form.rooms.join(', ')})</span>}
            </div>
          </Section>

          {/* Financials */}
          <Section title="Financials">
            <RoomChargesEditor value={roomCharges} onChange={rows => { setRoomTouched(true); update('roomCharges', rows); }} />
            {!roomTouched && form.rooms.length > 0 && (
              <p className="text-xs italic mt-1.5 text-stone-500">Auto-filled from the selected rooms — edit any cell to customise.</p>
            )}

            <div className="mt-4 pt-4 border-t border-stone-200">
              <AddOnsEditor value={form.addOns} onChange={v => update('addOns', v)} />
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-stone-200">
              <Field label="Total Package Amount (₹)" type="number" value={displayTotal} onChange={v => { enterManual(); update('totalAmount', Number(v)); }} />
              <Field label="Advance Received (₹)" type="number" value={form.advancePaid} onChange={v => update('advancePaid', Number(v))} />
              <Field label="Rate Breakdown" value={displayBreakdown} onChange={v => { enterManual(); update('rateBreakdown', v); }} />
              {form.status === 'hold' && (
                <Field label="Advance to be Paid (₹)" type="number" value={form.advanceRequired} onChange={v => update('advanceRequired', Number(v))} />
              )}
            </div>
            <div className="text-xs text-right text-stone-600 mt-2">
              Room charges ₹{roomSum.toLocaleString('en-IN')}{addOnsSum > 0 ? ` + Add-ons ₹${addOnsSum.toLocaleString('en-IN')}` : ''} ={' '}
              <strong className="text-stone-900">₹{autoGrand.toLocaleString('en-IN')}</strong>
            </div>
            <p className="text-xs italic mt-1 text-stone-500">
              {rateTouched ? (
                <>Custom total entered.{' '}
                  <button type="button" onClick={resetToAuto} className="text-emerald-700 underline not-italic">↻ Reset to auto (₹{autoGrand.toLocaleString('en-IN')})</button>
                </>
              ) : (
                <>Total auto-sums room charges + add-ons — edit the amount to override.</>
              )}
            </p>
          </Section>

          {/* Inclusions & Notes */}
          <Section title="Inclusions & Notes">
            <Field label="Inclusions (one per line)" textarea rows={5} value={form.inclusions} onChange={v => update('inclusions', v)} />
            <Field label="Internal Remarks" textarea rows={2} value={form.remarks} onChange={v => update('remarks', v)} />
            <Field label="Guest Special Requests" textarea rows={2} value={form.specialRequests} onChange={v => update('specialRequests', v)} />
          </Section>

          {/* Handled By */}
          <Section title="Handled By">
            <div className="max-w-xs">
              <select value={form.createdBy} onChange={e => update('createdBy', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm bg-white outline-none focus:border-emerald-700 transition">
                {allAgents.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </Section>

          <div className="flex justify-end gap-3 pt-2 border-t border-stone-300">
            <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 transition tracking-wider">CANCEL</button>
            <button onClick={handleSave} disabled={isPending} className="px-6 py-2.5 text-sm bg-emerald-900 hover:bg-emerald-800 text-amber-100 transition tracking-wider disabled:opacity-50">
              {isPending ? 'SAVING…' : isEdit ? 'UPDATE RESERVATION' : 'CONFIRM RESERVATION'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-widest text-stone-400 font-medium pb-1.5 border-b border-stone-200">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', textarea, rows = 3, readOnly, min }: {
  label: string; value: string | number | null; onChange?: (v: string) => void;
  type?: string; textarea?: boolean; rows?: number; readOnly?: boolean; min?: string | number;
}) {
  return (
    <div>
      <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">{label}</label>
      {textarea ? (
        <textarea value={value ?? ''} onChange={e => onChange?.(e.target.value)} rows={rows} readOnly={readOnly}
          className={`w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 transition ${readOnly ? 'bg-stone-100' : 'bg-white'}`} />
      ) : type === 'date' ? (
        <DateInput
          value={value == null ? '' : String(value)}
          onChange={v => onChange?.(v)}
          min={min !== undefined ? String(min) : undefined}
          readOnly={readOnly}
          className="w-full"
        />
      ) : type === 'number' && !readOnly ? (
        <NumberInput
          value={typeof value === 'number' ? value : Number(value ?? 0)}
          onChange={n => onChange?.(String(n))}
          min={typeof min === 'number' ? min : undefined}
          className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 transition bg-white"
        />
      ) : (
        <input type={type} value={value ?? ''} onChange={e => onChange?.(e.target.value)} readOnly={readOnly} min={min}
          className={`w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 transition ${readOnly ? 'bg-stone-100' : 'bg-white'}`} />
      )}
    </div>
  );
}
