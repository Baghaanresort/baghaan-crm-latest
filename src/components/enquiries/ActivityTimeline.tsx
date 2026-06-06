'use client';

import { useState, useTransition } from 'react';
import { Phone, MessageCircle, Mail, FileText, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { addEnquiryActivity } from '@/lib/actions/activities';
import type { EnquiryActivity, ActivityType } from '@/lib/types/enquiry';

const ACTIVITY_ICONS: Record<ActivityType, React.ElementType> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  note: FileText,
  status_change: RefreshCw,
  booking_created: Plus,
};

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  call: 'text-blue-700 bg-blue-50',
  whatsapp: 'text-green-700 bg-green-50',
  email: 'text-purple-700 bg-purple-50',
  note: 'text-stone-700 bg-stone-50',
  status_change: 'text-amber-700 bg-amber-50',
  booking_created: 'text-emerald-700 bg-emerald-50',
};

interface Props {
  enquiryId: string;
  activities: EnquiryActivity[];
}

export function ActivityTimeline({ enquiryId, activities: initialActivities }: Props) {
  const [activities, setActivities] = useState(initialActivities);
  const [type, setType] = useState<ActivityType>('call');
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleAdd = () => {
    if (!note.trim()) { toast.error('Note is required'); return; }
    startTransition(async () => {
      const result = await addEnquiryActivity({ enquiryId, type, note: note.trim() });
      if (!result.success) { toast.error(result.error); return; }
      setActivities(prev => [result.data, ...prev]);
      setNote('');
      toast.success('Activity logged');
    });
  };

  return (
    <div>
      {/* Log new activity */}
      <div className="bg-stone-50 border border-stone-200 p-3 mb-4">
        <div className="text-xs uppercase tracking-wider text-stone-600 mb-2 font-medium">Log Activity</div>
        <div className="flex gap-2 mb-2">
          {(['call', 'whatsapp', 'email', 'note'] as ActivityType[]).map(t => {
            const Icon = ACTIVITY_ICONS[t]!;
            return (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 border transition ${type === t ? ACTIVITY_COLORS[t] + ' border-current' : 'border-stone-300 text-stone-500 hover:bg-stone-100'}`}
              >
                <Icon size={11} /> {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="What happened? What was discussed?"
            className="flex-1 px-3 py-2 border border-stone-300 text-sm outline-none bg-white resize-none"
          />
          <button
            onClick={handleAdd}
            disabled={isPending || !note.trim()}
            className="px-4 text-xs bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap self-start mt-0.5 py-2"
          >
            {isPending ? '…' : 'ADD'}
          </button>
        </div>
      </div>

      {/* Timeline */}
      {activities.length === 0 ? (
        <p className="text-xs text-stone-400 italic">No activities logged yet</p>
      ) : (
        <div className="space-y-2">
          {activities.map(a => {
            const Icon = ACTIVITY_ICONS[a.type] ?? FileText;
            return (
              <div key={a.id} className="flex gap-3 text-sm">
                <div className={`mt-0.5 p-1.5 rounded-full flex-shrink-0 ${ACTIVITY_COLORS[a.type] ?? ''}`}>
                  <Icon size={11} />
                </div>
                <div className="flex-1">
                  <div className="text-stone-800">{a.note}</div>
                  <div className="text-xs text-stone-400 mt-0.5">
                    {a.createdBy} · {(() => { const d = new Date(a.createdAt); const dd = String(d.getDate()).padStart(2,'0'); const mm = String(d.getMonth()+1).padStart(2,'0'); const hh = String(d.getHours()).padStart(2,'0'); const min = String(d.getMinutes()).padStart(2,'0'); return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`; })()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
