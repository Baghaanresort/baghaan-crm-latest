'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { createEnquiry, updateEnquiry } from '@/lib/actions/enquiries';
import { getEnquiryActivities } from '@/lib/actions/activities';
import { ENQUIRY_SOURCES, ENQUIRY_TYPES, ENQUIRY_STATUSES, LOST_REASONS } from '@/lib/constants/enquiry';
import { todayISO } from '@/lib/utils/date';
import { isValidPhone, PHONE_ERROR } from '@/lib/validations/phone';
import { DateInput } from '@/components/ui/DateInput';
import type { Enquiry, EnquiryActivity } from '@/lib/types/enquiry';
import { ActivityTimeline } from '@/components/enquiries/ActivityTimeline';

interface Props {
  enquiry?: Enquiry;
  users: Array<{ name: string; role: string }>;
  currentUser: { id: string; name: string; role: string };
  onClose: () => void;
}

export function EnquiryModal({ enquiry, users, currentUser, onClose }: Props) {
  const today = todayISO();
  const isEdit = !!enquiry;
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'details' | 'activity'>('details');
  const [activities, setActivities] = useState<EnquiryActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesLoaded, setActivitiesLoaded] = useState(false);

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
    // Lost-reason capture: split a stored reason into a known dropdown value vs. free text
    lostReason: (LOST_REASONS as readonly string[]).includes(enquiry?.lostReason ?? '') ? (enquiry?.lostReason ?? '') : (enquiry?.lostReason ? 'Other' : ''),
    lostOther: (LOST_REASONS as readonly string[]).includes(enquiry?.lostReason ?? '') ? '' : (enquiry?.lostReason ?? ''),
  });

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name.trim()) { toast.error('Guest name is required'); return; }
    if (!form.phone.trim()) { toast.error('Phone number is required'); return; }
    if (!isValidPhone(form.phone)) { toast.error(PHONE_ERROR); return; }
    if (!form.source) { toast.error('Source is required'); return; }

    const resolvedLostReason = form.status === 'lost'
      ? (form.lostReason === 'Other' ? form.lostOther.trim() : form.lostReason)
      : form.lostReason;
    if (form.status === 'lost') {
      if (!form.lostReason) { toast.error('Please select a loss reason'); return; }
      if (form.lostReason === 'Other' && !resolvedLostReason) { toast.error('Please describe the loss reason'); return; }
    }
    const payload = { ...form, lostReason: resolvedLostReason };

    startTransition(async () => {
      if (isEdit && enquiry) {
        const result = await updateEnquiry(enquiry.id, payload);
        if (!result.success) { toast.error(result.error); return; }
        toast.success('Lead updated');
      } else {
        const result = await createEnquiry({ ...payload, date: form.date, createdBy: form.createdBy });
        if (!result.success) { toast.error(result.error); return; }
        toast.success(`Lead #${result.data.enquiryNumber} created`);
      }
      router.refresh();
      onClose();
    });
  };

  const handleTabChange = async (tab: 'details' | 'activity') => {
    setActiveTab(tab);
    if (tab === 'activity' && !activitiesLoaded && enquiry) {
      setActivitiesLoading(true);
      const result = await getEnquiryActivities(enquiry.id);
      if (result.success) setActivities(result.data);
      setActivitiesLoaded(true);
      setActivitiesLoading(false);
    }
  };

  const allAgents = Array.from(new Set([currentUser.name, ...users.map(u => u.name)])).filter(Boolean);

  const fieldClass = 'w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white focus:border-emerald-700 transition';
  const labelClass = 'text-xs text-stone-600 uppercase tracking-wider block mb-1';
  const sectionHeader = 'text-xs uppercase tracking-widest text-stone-400 font-medium mb-3 pb-1.5 border-b border-stone-200';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-stone-50 max-w-2xl w-full my-8">

        {/* Modal header */}
        <div className="sticky top-0 bg-emerald-900 text-white px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">
              {isEdit ? 'Edit Lead' : 'Log New Lead'}
            </h2>
            {enquiry && <p className="text-xs text-stone-300 mt-0.5">Lead #{enquiry.enquiryNumber} · {enquiry.name}</p>}
          </div>
          <button onClick={onClose} className="hover:bg-emerald-800 p-1.5 rounded"><X size={18} /></button>
        </div>

        {/* Tabs — edit mode only */}
        {isEdit && (
          <div className="flex border-b border-stone-300 bg-white">
            <button
              onClick={() => handleTabChange('details')}
              className={`px-5 py-3 text-xs uppercase tracking-wider transition ${activeTab === 'details' ? 'border-b-2 border-emerald-700 text-emerald-800 font-semibold' : 'text-stone-500 hover:text-stone-700'}`}
            >
              Lead Details
            </button>
            <button
              onClick={() => handleTabChange('activity')}
              className={`px-5 py-3 text-xs uppercase tracking-wider transition ${activeTab === 'activity' ? 'border-b-2 border-emerald-700 text-emerald-800 font-semibold' : 'text-stone-500 hover:text-stone-700'}`}
            >
              Activity Log
            </button>
          </div>
        )}

        {/* Details tab */}
        {activeTab === 'details' && (
          <div className="p-6 space-y-6 overflow-y-auto max-h-[72vh]">

            {/* Contact Details */}
            <div>
              <div className={sectionHeader}>Contact Details</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Name *</label>
                  <input value={form.name} onChange={e => update('name', e.target.value)} placeholder="Full name" className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Phone / WhatsApp *</label>
                  <input type="tel" inputMode="tel" maxLength={20} value={form.phone} onChange={e => update('phone', e.target.value)} className={fieldClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className={labelClass}>Email</label>
                  <input type="email" value={form.email} onChange={e => update('email', e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Enquiry Date</label>
                  <DateInput value={form.date} onChange={v => update('date', v)} className="w-full" />
                </div>
              </div>
            </div>

            {/* Enquiry Details */}
            <div>
              <div className={sectionHeader}>Enquiry Details</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Source *</label>
                  <select value={form.source} onChange={e => update('source', e.target.value)} className={fieldClass}>
                    <option value="">Select source</option>
                    {ENQUIRY_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Enquiry Type</label>
                  <select value={form.enquiryType} onChange={e => update('enquiryType', e.target.value)} className={fieldClass}>
                    <option value="">Select type</option>
                    {ENQUIRY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className={labelClass}>No. of Rooms</label>
                  <input value={form.numberOfRooms} onChange={e => update('numberOfRooms', e.target.value)} placeholder="e.g. 5–6" className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Preferred Check-in Date</label>
                  <DateInput value={form.preferredDates} min={today} clearable onChange={v => update('preferredDates', v)} className="w-full" />
                </div>
              </div>
            </div>

            {/* Pipeline & Follow-up */}
            <div>
              <div className={sectionHeader}>Pipeline & Follow-up</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Stage</label>
                  <select value={form.status} onChange={e => update('status', e.target.value as Enquiry['status'])} className={fieldClass}>
                    {Object.entries(ENQUIRY_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                {form.status === 'lost' && (
                  <div>
                    <label className={labelClass}>Loss Reason</label>
                    <select value={form.lostReason} onChange={e => update('lostReason', e.target.value)} className={fieldClass}>
                      <option value="">Select reason</option>
                      {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    {form.lostReason === 'Other' && (
                      <input value={form.lostOther} onChange={e => update('lostOther', e.target.value)} placeholder="Describe the reason…" className={`${fieldClass} mt-2`} />
                    )}
                  </div>
                )}
                <div>
                  <label className={labelClass}>Follow-up Date</label>
                  <DateInput value={form.followupDate ?? ''} clearable onChange={v => update('followupDate', v || null)} className="w-full" />
                </div>
              </div>
              <div className="mt-4">
                <label className={labelClass}>Next Action</label>
                <input value={form.nextAction} onChange={e => update('nextAction', e.target.value)} placeholder="e.g. Send cost sheet by Monday" className={fieldClass} />
              </div>
              <div className="mt-4">
                <label className={labelClass}>Notes</label>
                <textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={3} className={fieldClass} />
              </div>
              <div className="mt-4">
                <label className={labelClass}>Assigned To</label>
                <select value={form.createdBy} onChange={e => update('createdBy', e.target.value)} className={fieldClass}>
                  {allAgents.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-stone-300">
              <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 transition tracking-wider">CANCEL</button>
              <button onClick={handleSave} disabled={isPending} className="px-6 py-2.5 text-sm bg-emerald-900 hover:bg-emerald-800 text-amber-100 transition tracking-wider disabled:opacity-50">
                {isPending ? 'SAVING…' : isEdit ? 'UPDATE LEAD' : 'LOG LEAD'}
              </button>
            </div>
          </div>
        )}

        {/* Activity Log tab */}
        {activeTab === 'activity' && enquiry && (
          <div className="p-6 overflow-y-auto max-h-[72vh]">
            {activitiesLoading ? (
              <div className="text-sm text-stone-400 italic text-center py-10">Loading activity history…</div>
            ) : (
              <ActivityTimeline enquiryId={enquiry.id} activities={activities} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
