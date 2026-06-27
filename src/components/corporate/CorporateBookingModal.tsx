'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { createCorporateBooking } from '@/lib/actions/corporate';
import { updateBooking } from '@/lib/actions/bookings';
import { isoDate, daysBetween, todayISO, addDays } from '@/lib/utils/date';
import { totalGuests, totalRooms } from '@/lib/utils/occupancy';
import { isValidPhone, PHONE_ERROR } from '@/lib/validations/phone';
import { DateInput } from '@/components/ui/DateInput';
import { NumberInput } from '@/components/ui/NumberInput';
import { AddOnsEditor } from '@/components/bookings/AddOnsEditor';
import type { Booking } from '@/lib/types/booking';

interface Props {
  booking?: Booking;
  users: Array<{ name: string; role: string }>;
  currentUser: { name: string; role: string };
  existingBookings: Booking[];
  onClose: () => void;
}

export function CorporateBookingModal({ booking, users, currentUser, onClose }: Props) {
  const isEdit = !!booking;
  const today = todayISO();
  const [isPending, startTransition] = useTransition();

  // Lazy initializer keeps the impure date math out of the render body.
  const [form, setForm] = useState(() => ({
    companyName: booking?.companyName ?? '',
    companyAddress: booking?.companyAddress ?? '',
    companyGST: booking?.companyGST ?? '',
    contactName: booking?.contactName ?? '',
    contactNumber: booking?.contactNumber ?? '',
    contactEmail: booking?.contactEmail ?? '',
    arrival: booking?.arrival ?? today,
    departure: booking?.departure ?? isoDate(new Date(Date.now() + 86400000)),
    rooms: booking?.rooms ?? [] as string[],
    guestCount: booking?.guestCount ?? { single: 0, double: 0, triple: 0 },
    remarks: booking?.remarks ?? '',
    addOns: booking?.addOns ?? ([] as Booking['addOns']),
    createdBy: booking?.createdBy ?? currentUser.name,
  }));

  // Nights is derived from the dates — computed in render, not stored/synced.
  const nights = daysBetween(form.arrival, form.departure);

  // Changing arrival defaults departure to the next day when it's empty or no
  // longer after arrival. A longer stay is preserved; user can still override.
  const handleArrivalChange = (v: string) =>
    setForm(f => ({ ...f, arrival: v, departure: (!f.departure || f.departure <= v) ? addDays(v, 1) : f.departure }));

  const handleSave = () => {
    if (!form.companyName.trim()) { toast.error('Company name is required'); return; }
    if (!form.contactNumber.trim()) { toast.error('Contact number is required'); return; }
    if (!isValidPhone(form.contactNumber)) { toast.error(PHONE_ERROR); return; }
    if (nights < 1) { toast.error('Departure must be after arrival'); return; }
    const cleanAddOns = form.addOns.filter(a => a.name.trim() !== '' || a.total > 0);

    startTransition(async () => {
      if (isEdit && booking) {
        const result = await updateBooking(booking.id, {
          companyName: form.companyName,
          companyAddress: form.companyAddress,
          companyGST: form.companyGST,
          contactName: form.contactName,
          contactNumber: form.contactNumber,
          contactEmail: form.contactEmail,
          arrival: form.arrival,
          departure: form.departure,
          nights,
          rooms: form.rooms,
          guestCount: form.guestCount,
          remarks: form.remarks,
          createdBy: form.createdBy,
          addOns: cleanAddOns,
});
        if (!result.success) { toast.error(result.error); return; }
        toast.success('Corporate booking updated');
      } else {
        const result = await createCorporateBooking({ ...form, nights, addOns: cleanAddOns });
        if (!result.success) { toast.error(result.error); return; }
        toast.success(`Corporate booking created: ${result.data.confirmationNumber}`);
      }
      onClose();
    });
  };

  const allAgents = Array.from(new Set([currentUser.name, ...users.map(u => u.name)])).filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-stone-50 max-w-4xl w-full my-8 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-emerald-900 text-white px-6 py-4 flex justify-between items-center z-10">
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">
            {isEdit ? 'Edit Company Details' : 'New Company Details'}
          </h2>
          <button onClick={onClose} className="hover:bg-emerald-800 p-1.5 rounded"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Company Name *</label><input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Company Address</label><input value={form.companyAddress} onChange={e => setForm(f => ({ ...f, companyAddress: e.target.value }))} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Company GST</label><input value={form.companyGST} onChange={e => setForm(f => ({ ...f, companyGST: e.target.value }))} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Contact Name</label><input value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Contact Number *</label><input type="tel" inputMode="tel" maxLength={20} value={form.contactNumber} onChange={e => setForm(f => ({ ...f, contactNumber: e.target.value }))} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Contact Email</label><input value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Arrival</label><DateInput value={form.arrival} onChange={v => handleArrivalChange(v)} className="w-full" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Departure</label><DateInput value={form.departure} min={form.arrival} onChange={v => setForm(f => ({ ...f, departure: v }))} className="w-full" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Nights</label><input type="number" value={nights} readOnly className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-stone-100" /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {(['single', 'double', 'triple'] as const).map(type => (
              <div key={type}><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">{type === 'single' ? 'Single Share' : type === 'double' ? 'Double Share' : 'Triple Share'} rooms</label>
                <NumberInput value={form.guestCount[type]} min={0} onChange={n => setForm(f => ({ ...f, guestCount: { ...f.guestCount, [type]: n } }))} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            ))}
          </div>
          <p className="text-xs text-stone-500 italic">
            Enter the number of <strong>rooms</strong> on each sharing basis. That works out to{' '}
            <span className="text-emerald-800 font-medium not-italic">{totalRooms(form.guestCount)} rooms · {totalGuests(form.guestCount)} guests</span>{' '}
            (single 1, double 2, triple 3 per room). Specific room numbers are picked in the cost sheet.
          </p>
          <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Remarks</label><textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
          <div className="border border-stone-200 bg-white p-3">
            <AddOnsEditor value={form.addOns} onChange={v => setForm(f => ({ ...f, addOns: v }))} />
          </div>
          <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Sales Agent</label>
            <select value={form.createdBy} onChange={e => setForm(f => ({ ...f, createdBy: e.target.value }))} className="w-full px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
              {allAgents.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-stone-300">
            <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 tracking-wider">CANCEL</button>
            <button onClick={handleSave} disabled={isPending} className="px-6 py-2.5 text-sm bg-emerald-900 hover:bg-emerald-800 text-amber-100 tracking-wider disabled:opacity-50">
              {isPending ? 'SAVING…' : isEdit ? 'UPDATE' : 'CREATE BOOKING'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
