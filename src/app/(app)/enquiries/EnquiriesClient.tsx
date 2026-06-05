'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Trash2, Edit2, ArrowRight, Download, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { updateEnquiry, deleteEnquiry, convertEnquiryToBooking } from '@/lib/actions/enquiries';
import { ENQUIRY_STATUSES, ENQUIRY_SOURCES, ENQUIRY_TYPES, LOST_REASONS } from '@/lib/constants/enquiry';
import { buildWaLink, WA_TEMPLATES } from '@/lib/constants/whatsapp';
import { addDays } from '@/lib/utils/date';
import { fmtDate, todayISO } from '@/lib/utils/date';
import type { Enquiry } from '@/lib/types/enquiry';
import type { UserRole } from '@/lib/types/profile';
import dynamic from 'next/dynamic';

const EnquiryModal = dynamic(() => import('@/components/enquiries/EnquiryModal').then(m => ({ default: m.EnquiryModal })), { ssr: false });

interface Props {
  initialEnquiries: Enquiry[];
  users: Array<{ name: string; role: string }>;
  currentUser: { id: string; name: string; role: UserRole };
}

export function EnquiriesClient({ initialEnquiries, users, currentUser }: Props) {
  const today = todayISO();
  const router = useRouter();
  const [enquiries, setEnquiries] = useState(initialEnquiries);
  useEffect(() => { setEnquiries(initialEnquiries); }, [initialEnquiries]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterAgent, setFilterAgent] = useState('all');
  const [isPending, startTransition] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const [editEnquiry, setEditEnquiry] = useState<Enquiry | null>(null);
  const [lostDialog, setLostDialog] = useState<{ enquiry: Enquiry; reason: string; renurtureAfter: number | null } | null>(null);

  const isSales = currentUser.role === 'Sales';
  const isAdmin = currentUser.role === 'Admin';

  const overdue = useMemo(() =>
    enquiries.filter(e => e.followupDate && e.followupDate < today && (e.status === 'new' || e.status === 'in_progress')).sort((a, b) => (a.followupDate ?? '').localeCompare(b.followupDate ?? '')),
    [enquiries, today]
  );
  const dueToday = useMemo(() =>
    enquiries.filter(e => e.followupDate === today && (e.status === 'new' || e.status === 'in_progress')),
    [enquiries, today]
  );

  const filtered = useMemo(() => {
    return enquiries.filter(e => {
      if (filterStatus !== 'all' && e.status !== filterStatus) return false;
      if (filterSource !== 'all' && e.source !== filterSource) return false;
      if (filterAgent !== 'all' && e.createdBy !== filterAgent) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!`${e.name} ${e.phone} ${e.email ?? ''} ${e.source}`.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [enquiries, search, filterStatus, filterSource, filterAgent]);

  const agentNames = useMemo(() => Array.from(new Set([...users.map(u => u.name), ...enquiries.map(e => e.createdBy)])).filter(Boolean), [users, enquiries]);

  const handleQuickStatus = (e: Enquiry, status: string) => {
    if (status === 'lost') { setLostDialog({ enquiry: e, reason: '', renurtureAfter: 30 }); return; }
    startTransition(async () => {
      const result = await updateEnquiry(e.id, { status: status as Enquiry['status'] });
      if (!result.success) { toast.error(result.error); return; }
      router.refresh();
    });
  };

  const handleMarkLost = () => {
    if (!lostDialog) return;
    const enquiry = lostDialog.enquiry;
    const followupDate = lostDialog.renurtureAfter ? addDays(today, lostDialog.renurtureAfter) : null;
    startTransition(async () => {
      const result = await updateEnquiry(enquiry.id, {
        status: 'lost',
        lostReason: lostDialog.reason,
        followupDate,
        nextAction: followupDate ? `Re-nurture after ${lostDialog.renurtureAfter} days` : '',
      });
      if (!result.success) { toast.error(result.error); return; }
      setLostDialog(null);
      toast.success(`Marked as lost${followupDate ? ` — follow-up set for ${lostDialog.renurtureAfter} days` : ''}`)
      router.refresh();
      // Auto-open WhatsApp with closing message
      const waUrl = buildWaLink(enquiry.phone, WA_TEMPLATES.enquiryLost(enquiry.name));
      window.open(waUrl, '_blank');
    });
  };

  const handleConvert = (e: Enquiry) => {
    startTransition(async () => {
      const result = await convertEnquiryToBooking(e.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Opening booking form…');
      router.push(`/bookings?convert=${e.id}&name=${encodeURIComponent(result.data.prefill.guestName)}&phone=${encodeURIComponent(result.data.prefill.contactNumber)}&email=${encodeURIComponent(result.data.prefill.email)}`);
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this enquiry?')) return;
    startTransition(async () => {
      const result = await deleteEnquiry(id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Enquiry deleted');
      router.refresh();
    });
  };

  // KPIs
  const total = enquiries.length;
  const newCount = enquiries.filter(e => e.status === 'new').length;
  const inProgress = enquiries.filter(e => e.status === 'in_progress').length;
  const booked = enquiries.filter(e => e.status === 'booked').length;
  const lost = enquiries.filter(e => e.status === 'lost').length;

  return (
    <div>
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Enquiries & Lead Tracker</h2>
          <p className="text-sm text-stone-500 italic">{filtered.length} of {total} leads</p>
        </div>
        <div className="flex gap-2">
          <a href="/api/export/enquiries" className="bg-white border border-stone-300 text-stone-600 hover:bg-stone-50 px-3 py-2 text-sm flex items-center gap-1.5 transition">
            <Download size={14} /> CSV
          </a>
          {(isSales || isAdmin) && (
            <button onClick={() => setShowNew(true)} className="bg-emerald-900 hover:bg-emerald-800 text-amber-100 px-5 py-2.5 text-sm tracking-wider flex items-center gap-2 transition">
              <Plus size={16} /> NEW ENQUIRY
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[['Total', total, ''], ['New', newCount, 'text-blue-700'], ['In Progress', inProgress, 'text-amber-700'], ['Booked', booked, 'text-emerald-700'], ['Lost', lost, 'text-stone-500']].map(([label, val, color]) => (
          <div key={String(label)} className="bg-white border border-stone-200 p-4">
            <div className="text-xs text-stone-500 uppercase tracking-wider">{label}</div>
            <div className={`text-2xl mt-1 font-semibold ${color}`} style={{ fontFamily: "'Cormorant Garamond', serif" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Follow-up panel */}
      {(overdue.length > 0 || dueToday.length > 0) && (
        <div className="bg-amber-50 border-2 border-amber-300 p-4 mb-5">
          <h3 className="text-sm uppercase tracking-wider text-amber-900 font-medium mb-3">Follow-up Required</h3>
          <div className="space-y-2">
            {[...overdue.map(e => ({ e, label: 'OVERDUE', color: 'text-red-700' })), ...dueToday.map(e => ({ e, label: 'TODAY', color: 'text-amber-800' }))].map(({ e, label, color }) => (
              <div key={e.id} className="flex items-center justify-between bg-white border border-amber-200 px-3 py-2">
                <div>
                  <span className={`text-xs font-bold mr-2 ${color}`}>{label}</span>
                  <span className="font-medium text-sm">{e.name || 'Unknown'}</span>
                  <span className="text-xs text-stone-500 ml-2">{e.phone} · {e.source}</span>
                  {e.nextAction && <div className="text-xs text-stone-600 italic mt-0.5">→ {e.nextAction}</div>}
                </div>
                <div className="flex gap-1">
                  <a href={buildWaLink(e.phone, WA_TEMPLATES.enquiryFollowup(e.name))} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 hover:bg-green-100 text-green-700 rounded" title="WhatsApp"><MessageCircle size={14} /></a>
                  <button onClick={() => setEditEnquiry(e)} className="p-1.5 hover:bg-stone-100 text-stone-600 rounded"><Edit2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex-1 relative min-w-[200px]">
          <Search size={14} className="absolute left-3 top-3 text-stone-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email..." className="w-full pl-9 pr-3 py-2 border border-stone-300 text-sm focus:border-emerald-700 outline-none bg-white" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
          <option value="all">All Statuses</option>
          {Object.entries(ENQUIRY_STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className="px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
          <option value="all">All Sources</option>
          {ENQUIRY_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)} className="px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
          <option value="all">All Agents</option>
          {agentNames.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-stone-200 overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-stone-400 italic">No enquiries match your filters</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-emerald-900 text-amber-100">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">#</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Contact</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Source / Type</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Follow-up</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Next Action</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Agent</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const st = ENQUIRY_STATUSES[e.status];
                const isOverdue = e.followupDate && e.followupDate < today && (e.status === 'new' || e.status === 'in_progress');
                return (
                  <tr key={e.id} className="border-t border-stone-100 hover:bg-stone-50">
                    <td className="p-3">
                      <div className="font-mono text-xs text-stone-500">{e.enquiryNumber}</div>
                      {e.linkedBookingId && e.nextAction?.startsWith('Booking created') && (
                        <div className="text-xs text-emerald-700 mt-0.5">↗ {e.nextAction.replace('Booking created · ', '')}</div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{e.name || '(No name)'}</div>
                      <div className="text-xs text-stone-500">{e.phone}</div>
                      {e.preferredDates && <div className="text-xs text-stone-400 italic">{e.preferredDates}</div>}
                    </td>
                    <td className="p-3">
                      <div className="text-xs">{e.source}</div>
                      {e.enquiryType && <div className="text-xs text-stone-500">{e.enquiryType}</div>}
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 ${st.color}`}>{st.label}</span>
                    </td>
                    <td className={`p-3 text-xs ${isOverdue ? 'text-red-700 font-medium' : 'text-stone-600'}`}>
                      {e.followupDate ? fmtDate(e.followupDate) : '—'}
                      {isOverdue && ' ⚠'}
                    </td>
                    <td className="p-3 text-xs text-stone-600 max-w-[150px] truncate">{e.nextAction || '—'}</td>
                    <td className="p-3 text-xs text-stone-500">{e.createdBy}</td>
                    <td className="p-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <a href={buildWaLink(e.phone, WA_TEMPLATES.enquiryFollowup(e.name))} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-green-100 text-green-700 rounded" title="WhatsApp"><MessageCircle size={12} /></a>
                        {(isSales || isAdmin) && (
                          <>
                            <button onClick={() => setEditEnquiry(e)} className="p-1.5 hover:bg-stone-100 text-stone-600 rounded" title="Edit"><Edit2 size={12} /></button>
                            {e.status !== 'lost' && (
                              <button onClick={() => handleQuickStatus(e, 'lost')} className="text-xs border border-red-200 px-2 py-1 hover:bg-red-50 text-red-600">Lost</button>
                            )}
                            {e.status !== 'booked' && e.status !== 'lost' && (
                              <button onClick={() => handleConvert(e)} disabled={isPending} className="text-xs border border-emerald-600 px-2 py-1 hover:bg-emerald-50 text-emerald-700 disabled:opacity-50">Book</button>
                            )}
                            <button onClick={() => handleDelete(e.id)} disabled={isPending} className="p-1.5 hover:bg-red-100 text-red-600 rounded disabled:opacity-50" title="Delete"><Trash2 size={12} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Lost reason dialog */}
      {lostDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-medium mb-1">Mark as Lost</h3>
            <p className="text-xs text-stone-500 mb-4">A WhatsApp closing message will open for the guest automatically.</p>

            <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Reason (optional)</label>
            <select value={lostDialog.reason} onChange={e => setLostDialog(d => d ? { ...d, reason: e.target.value } : null)} className="w-full px-3 py-2 border border-stone-300 text-sm mb-4 bg-white">
              <option value="">Select reason</option>
              {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Follow-up Reminder</label>
            <select
              value={lostDialog.renurtureAfter ?? ''}
              onChange={e => setLostDialog(d => d ? { ...d, renurtureAfter: e.target.value ? Number(e.target.value) : null } : null)}
              className="w-full px-3 py-2 border border-stone-300 text-sm mb-4 bg-white"
            >
              <option value="">No follow-up needed</option>
              <option value="15">Follow up in 15 days</option>
              <option value="30">Follow up in 30 days</option>
              <option value="45">Follow up in 45 days</option>
              <option value="60">Follow up in 60 days</option>
              <option value="90">Follow up in 90 days</option>
            </select>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setLostDialog(null)} className="px-4 py-2 text-sm border border-stone-300 hover:bg-stone-100">Cancel</button>
              <button onClick={handleMarkLost} disabled={isPending} className="px-4 py-2 text-sm bg-red-700 text-white hover:bg-red-800 disabled:opacity-50">Mark as Lost</button>
            </div>
          </div>
        </div>
      )}

      {showNew && <EnquiryModal users={users} currentUser={currentUser} onClose={() => setShowNew(false)} />}
      {editEnquiry && <EnquiryModal enquiry={editEnquiry} users={users} currentUser={currentUser} onClose={() => setEditEnquiry(null)} />}
    </div>
  );
}
