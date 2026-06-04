'use client';

import { useState, useTransition } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { createEnquiry, updateEnquiry, convertEnquiryToBooking } from '@/lib/actions/enquiries';
import { ENQUIRY_SOURCES, ENQUIRY_TYPES, ENQUIRY_STATUSES } from '@/lib/constants/enquiry';
import { todayISO } from '@/lib/utils/date';
import type { Enquiry } from '@/lib/types/enquiry';

interface Props {
  enquiry?: Enquiry & { _convert?: boolean };
  users: Array<{ name: string; role: string }>;
  currentUser: { id: string; name: string; role: string };
  onClose: () => void;
}

export function EnquiryModal({ enquiry, users, currentUser, onClose }: Props) {
  const today = todayISO();
  const isEdit = !!enquiry && !enquiry._convert;
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [form, setForm] = useState({
    date: enquiry?.date ?? today,
    name: enquiry?.name ?? '',
    phone: enquiry?.phone ?? '',
    email: enquiry?.email ?? '',
    source: enquiry?.source ?? '',
    enquiryType: enquiry?.enquiryType ?? '',
    numberOfRooms: enquiry?.numberOfRooms ?? '',
    preferredDates: enquiry?.preferredDates ?? '',
    status: (enquiry?.status ?? 'new') as Enquiry['status'],
    nextAction: enquiry?.nextAction ?? '',
    followupDate: enquiry?.followupDate ?? null as string | null,
    notes: enquiry?.notes ?? '',
    createdBy: enquiry?.createdBy ?? currentUser.name,
  });

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.phone.trim()) { toast.error('Phone number is required'); return; }
    if (!form.source) { toast.error('Source is required'); return; }

    startTransition(async () => {
      if (isEdit && enquiry) {
        const result = await updateEnquiry(enquiry.id, form);
        if (!result.success) { toast.error(result.error); return; }
        toast.success('Enquiry updated');
      } else {
        const result = await createEnquiry({ ...form, date: form.date, createdBy: form.createdBy });
        if (!result.success) { toast.error(result.error); return; }
        toast.success(`Enquiry #${result.data.enquiryNumber} created`);
      }
      router.refresh();
      onClose();
    });
  };

  const handleConvert = () => {
    if (!enquiry) return;
    startTransition(async () => {
      const result = await convertEnquiryToBooking(enquiry.id);
      if (!result.success) { toast.error(result.error); return; }
      // Navigate to bookings page with prefill data in URL params
      router.push(`/bookings?convert=${enquiry.id}&name=${encodeURIComponent(result.data.prefill.guestName)}&phone=${encodeURIComponent(result.data.prefill.contactNumber)}&email=${encodeURIComponent(result.data.prefill.email)}`);
      onClose();
    });
  };

  const allAgents = Array.from(new Set([currentUser.name, ...users.map(u => u.name)])).filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" style={{ fontFamily: "'Lora', Georgia, serif" }}>
      <div className="bg-stone-50 max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-emerald-900 text-white px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">
              {isEdit ? 'Edit Enquiry' : 'New Enquiry'}
            </h2>
            {enquiry && <p className="text-xs text-stone-300 mt-0.5">Enquiry #{enquiry.enquiryNumber}</p>}
          </div>
          <button onClick={onClose} className="hover:bg-emerald-800 p-1.5 rounded"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Enquiry Date</label><input type="date" value={form.date} onChange={e => update('date', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Phone / WhatsApp *</label><input value={form.phone} onChange={e => update('phone', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Name</label><input value={form.name} onChange={e => update('name', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Email</label><input type="email" value={form.email} onChange={e => update('email', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Source *</label>
              <select value={form.source} onChange={e => update('source', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
                <option value="">Select source</option>
                {ENQUIRY_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Type</label>
              <select value={form.enquiryType} onChange={e => update('enquiryType', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
                <option value="">Select type</option>
                {ENQUIRY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Rooms Needed</label><input value={form.numberOfRooms} onChange={e => update('numberOfRooms', e.target.value)} placeholder="e.g. 5-6" className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Preferred Dates</label><input value={form.preferredDates} onChange={e => update('preferredDates', e.target.value)} placeholder="e.g. Mid-Nov weekend" className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Status</label>
              <select value={form.status} onChange={e => update('status', e.target.value as Enquiry['status'])} className="w-full px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
                {Object.entries(ENQUIRY_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Follow-up Date</label><input type="date" value={form.followupDate ?? ''} onChange={e => update('followupDate', e.target.value || null)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
          </div>

          <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Next Action</label><input value={form.nextAction} onChange={e => update('nextAction', e.target.value)} placeholder="e.g. Send cost sheet by Monday" className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>

          <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Notes</label><textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={3} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>

          <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Agent</label>
            <select value={form.createdBy} onChange={e => update('createdBy', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
              {allAgents.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="flex justify-between pt-4 border-t border-stone-300">
            {isEdit && enquiry && (
              <button onClick={handleConvert} disabled={isPending} className="flex items-center gap-2 text-sm bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 tracking-wider disabled:opacity-50">
                <ArrowRight size={14} /> CONVERT TO BOOKING
              </button>
            )}
            <div className="flex gap-3 ml-auto">
              <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 transition tracking-wider">CANCEL</button>
              <button onClick={handleSave} disabled={isPending} className="px-6 py-2.5 text-sm bg-emerald-900 hover:bg-emerald-800 text-amber-100 transition tracking-wider disabled:opacity-50">
                {isPending ? 'SAVING…' : isEdit ? 'UPDATE' : 'CREATE ENQUIRY'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
