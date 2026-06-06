'use client';

import { useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { fmtDate, fmtDateTime } from '@/lib/utils/date';
import { ENQUIRY_STATUSES } from '@/lib/constants/enquiry';
import type { Enquiry } from '@/lib/types/enquiry';

interface Props {
  enquiry: Enquiry;
  onClose: () => void;
}

// Read-only details dialog opened from the eye icon in the enquiry list.
// Dismissible via the close button or the Escape key.
export function EnquiryViewModal({ enquiry, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const st = ENQUIRY_STATUSES[enquiry.status];
  const isLost = enquiry.status === 'lost';

  const rows: Array<[string, React.ReactNode]> = [
    ['Lead #', `#${enquiry.enquiryNumber}`],
    ['Name', enquiry.name || '—'],
    ['Phone / WhatsApp', enquiry.phone || '—'],
    ['Email', enquiry.email || '—'],
    ['Enquiry Date', fmtDate(enquiry.date) || '—'],
    ['Source', enquiry.source || '—'],
    ['Enquiry Type', enquiry.enquiryType || '—'],
    ['No. of Rooms', enquiry.numberOfRooms || '—'],
    ['Preferred Check-in', fmtDate(enquiry.preferredDates) || '—'],
    ['Follow-up Date', fmtDate(enquiry.followupDate) || '—'],
    ['Next Action', enquiry.nextAction || '—'],
    ['Assigned To', enquiry.createdBy || '—'],
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-stone-50 max-w-2xl w-full my-8" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-emerald-900 text-white px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">Enquiry Details</h2>
            <p className="text-xs text-stone-300 mt-0.5">Lead #{enquiry.enquiryNumber} · {enquiry.name || '(No name)'}</p>
          </div>
          <button onClick={onClose} className="hover:bg-emerald-800 p-1.5 rounded" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[72vh]">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 inline-flex items-center gap-1 ${st.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
              {st.label}
            </span>
            {enquiry.linkedBookingId && <span className="text-xs text-emerald-700">↗ Converted to booking</span>}
          </div>

          {/* Loss reason — prominent for lost cases */}
          {isLost && (
            <div className="bg-red-50 border-2 border-red-300 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-red-800 font-semibold mb-1.5">
                <AlertTriangle size={14} /> Reason for Loss
              </div>
              <p className="text-sm text-red-900 font-medium">{enquiry.lostReason || 'No reason recorded'}</p>
              {enquiry.lostAt && <p className="text-xs text-red-600 mt-1">Marked lost on {fmtDate(enquiry.lostAt)}</p>}
            </div>
          )}

          {/* Key details */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-stone-500 uppercase tracking-wider mb-0.5">{label}</dt>
                <dd className="text-sm text-stone-800">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Notes */}
          {enquiry.notes && (
            <div>
              <div className="text-xs text-stone-500 uppercase tracking-wider mb-1">Notes</div>
              <p className="text-sm text-stone-700 whitespace-pre-wrap bg-white border border-stone-200 p-3">{enquiry.notes}</p>
            </div>
          )}

          {/* Audit footer */}
          <div className="text-xs text-stone-400 pt-3 border-t border-stone-200">
            Created {fmtDateTime(enquiry.createdAt)}{enquiry.updatedAt ? ` · Updated ${fmtDateTime(enquiry.updatedAt)}` : ''}
          </div>

          <div className="flex justify-end pt-2 border-t border-stone-300">
            <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 transition tracking-wider">CLOSE</button>
          </div>
        </div>
      </div>
    </div>
  );
}
