'use client';

import { useState, useTransition, useMemo, useEffect } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { createBooking, updateBooking } from '@/lib/actions/bookings';
import { markEnquiryConverted } from '@/lib/actions/enquiries';
import { ROOM_INVENTORY, DEFAULT_RATES, getRoomCategory } from '@/lib/constants/rooms';
import { datesInRange, isoDate, daysBetween, todayISO } from '@/lib/utils/date';
import type { Booking } from '@/lib/types/booking';

interface Props {
  booking?: Booking;
  users: Array<{ name: string; role: string }>;
  currentUser: { name: string; role: string };
  existingBookings: Booking[];
  prefill?: { guestName?: string; contactNumber?: string; email?: string; remarks?: string } | null;
  sourceEnquiryId?: string | null;
  onClose: () => void;
}

export function BookingModal({ booking, users, currentUser, existingBookings, prefill, sourceEnquiryId, onClose }: Props) {
  const isEdit = !!booking;
  const today = todayISO();
  const [isPending, startTransition] = useTransition();

  const defaultArrival = isoDate(new Date());
  const defaultDeparture = isoDate(new Date(Date.now() + 86400000));

  const [form, setForm] = useState({
    guestName: booking?.guestName ?? prefill?.guestName ?? '',
    contactNumber: booking?.contactNumber ?? prefill?.contactNumber ?? '',
    email: booking?.email ?? prefill?.email ?? '',
    companyName: booking?.companyName ?? '',
    gstNumber: booking?.gstNumber ?? '',
    arrival: booking?.arrival ?? defaultArrival,
    departure: booking?.departure ?? defaultDeparture,
    nights: booking?.nights ?? 1,
    adults: booking?.adults ?? 2,
    children: booking?.children ?? 0,
    rooms: booking?.rooms ?? ([] as string[]),
    rateBreakdown: booking?.rateBreakdown ?? '',
    totalAmount: booking?.totalAmount ?? 0,
    advancePaid: booking?.advancePaid ?? 0,
    inclusions: booking?.inclusions ?? '',
    remarks: booking?.remarks ?? prefill?.remarks ?? '',
    specialRequests: booking?.specialRequests ?? '',
    createdBy: booking?.createdBy ?? currentUser.name,
    status: (booking?.status ?? 'confirmed') as 'confirmed' | 'hold',
    holdExpiresAt: booking?.holdExpiresAt ?? null,
  });

  useEffect(() => {
    const n = daysBetween(form.arrival, form.departure);
    if (n !== form.nights) setForm(f => ({ ...f, nights: n }));
  }, [form.arrival, form.departure]);

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

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

  const autoRate = () => {
    const total = form.rooms.reduce((s, r) => {
      const cat = getRoomCategory(r);
      return s + (cat !== 'Other' ? DEFAULT_RATES[cat] : 0);
    }, 0) * form.nights;
    update('totalAmount', total);
    update('rateBreakdown', `${form.rooms.length} room(s) × ${form.nights} night(s) @ avg ₹${form.rooms.length > 0 ? Math.round(total / form.rooms.length / form.nights).toLocaleString('en-IN') : 0}/night`);
  };

  const allAgents = useMemo(() => Array.from(new Set([currentUser.name, ...users.map(u => u.name)])).filter(Boolean), [users, currentUser.name]);

  const handleSave = () => {
    if (!form.guestName.trim()) { toast.error('Guest name is required'); return; }
    if (!form.contactNumber.trim()) { toast.error('Contact number is required'); return; }
    if (form.rooms.length === 0) { toast.error('Select at least one room'); return; }
    if (form.nights < 1) { toast.error('Departure must be after arrival'); return; }

    startTransition(async () => {
      if (isEdit) {
        const result = await updateBooking(booking.id, { ...form, bookingType: 'regular' });
        if (!result.success) { toast.error(result.error); return; }
        toast.success('Booking updated');
      } else {
        const result = await createBooking({ ...form, bookingType: 'regular' });
        if (!result.success) { toast.error(result.error); return; }
        // Link to enquiry if converting
        if (sourceEnquiryId) {
          await markEnquiryConverted(sourceEnquiryId, result.data.id, result.data.confirmationNumber);
        }
        toast.success(`Booking created: ${result.data.confirmationNumber}`);
      }
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-stone-50 max-w-4xl w-full my-8 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-emerald-900 text-white px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">{isEdit ? 'Edit Booking' : 'New Booking'}</h2>
            {booking && <p className="text-xs text-stone-300 mt-0.5 font-mono">{booking.confirmationNumber}</p>}
          </div>
          <button onClick={onClose} className="hover:bg-emerald-800 p-1.5 rounded"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Guest */}
          <Section title="Guest Details">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Guest Name *" value={form.guestName} onChange={v => update('guestName', v)} />
              <Field label="Contact Number *" value={form.contactNumber} onChange={v => update('contactNumber', v)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email" value={form.email} onChange={v => update('email', v)} type="email" />
              <Field label="Company Name" value={form.companyName} onChange={v => update('companyName', v)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="GST Number" value={form.gstNumber} onChange={v => update('gstNumber', v)} />
            </div>
          </Section>

          {/* Dates */}
          <Section title="Stay Details">
            <div className="grid grid-cols-5 gap-3">
              <Field label="Arrival" type="date" value={form.arrival} min={today} onChange={v => update('arrival', v)} />
              <Field label="Departure" type="date" value={form.departure} min={form.arrival} onChange={v => update('departure', v)} />
              <Field label="Nights" type="number" value={form.nights} readOnly />
              <Field label="Adults" type="number" value={form.adults} min={0} onChange={v => update('adults', Number(v))} />
              <Field label="Children" type="number" value={form.children} min={0} onChange={v => update('children', Number(v))} />
            </div>
          </Section>

          {/* Status */}
          <Section title="Booking Status">
            <div className="flex gap-4">
              {(['confirmed', 'hold'] as const).map(s => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={form.status === s} onChange={() => update('status', s)} />
                  <span className="text-sm capitalize">{s}</span>
                </label>
              ))}
            </div>
            {form.status === 'hold' && (
              <div className="mt-3">
                <Field label="Hold Expires At" type="datetime-local" value={form.holdExpiresAt ?? ''} onChange={v => update('holdExpiresAt', v || null)} />
              </div>
            )}
          </Section>

          {/* Rooms */}
          <Section title="Room Selection">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-stone-500 italic">Greyed-out rooms are already booked for these dates</p>
              <button onClick={autoRate} type="button" className="text-xs bg-stone-100 border border-stone-300 px-3 py-1.5 hover:bg-stone-200">AUTO-RATE</button>
            </div>
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
              Selected: <strong className="not-italic">{form.rooms.length}</strong> room(s)
            </div>
          </Section>

          {/* Financials */}
          <Section title="Rates & Payments">
            <div className="grid grid-cols-3 gap-4">
              <Field label="Total Package Amount (₹)" type="number" value={form.totalAmount} onChange={v => update('totalAmount', Number(v))} />
              <Field label="Advance Paid (₹)" type="number" value={form.advancePaid} onChange={v => update('advancePaid', Number(v))} />
              <Field label="Rate Breakdown" value={form.rateBreakdown} onChange={v => update('rateBreakdown', v)} />
            </div>
          </Section>

          {/* Notes */}
          <Section title="Voucher Inclusions & Notes">
            <Field label="Inclusions (one per line)" textarea rows={5} value={form.inclusions} onChange={v => update('inclusions', v)} />
            <Field label="Remarks / Special Notes" textarea rows={2} value={form.remarks} onChange={v => update('remarks', v)} />
            <Field label="Special Requests" textarea rows={2} value={form.specialRequests} onChange={v => update('specialRequests', v)} />
          </Section>

          {/* Agent */}
          <Section title="Sales Agent">
            <select value={form.createdBy} onChange={e => update('createdBy', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm bg-white outline-none focus:border-emerald-700">
              {allAgents.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Section>

          <div className="flex justify-end gap-3 pt-4 border-t border-stone-300">
            <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 transition tracking-wider">CANCEL</button>
            <button onClick={handleSave} disabled={isPending} className="px-6 py-2.5 text-sm bg-emerald-900 hover:bg-emerald-800 text-amber-100 transition tracking-wider disabled:opacity-50">
              {isPending ? 'SAVING…' : isEdit ? 'UPDATE BOOKING' : 'CREATE BOOKING'}
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
      <h3 className="text-sm uppercase tracking-wider text-emerald-900 border-b border-stone-300 pb-1.5" style={{ letterSpacing: '0.15em' }}>{title}</h3>
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
          className={`w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 ${readOnly ? 'bg-stone-100' : 'bg-white'}`} />
      ) : (
        <input type={type} value={value ?? ''} onChange={e => onChange?.(e.target.value)} readOnly={readOnly} min={min}
          className={`w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 ${readOnly ? 'bg-stone-100' : 'bg-white'}`} />
      )}
    </div>
  );
}
