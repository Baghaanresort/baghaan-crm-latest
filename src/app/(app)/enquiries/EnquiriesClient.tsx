'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Edit2, Download, MessageCircle, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { updateEnquiry, bookEnquiry, releaseEnquiryHold } from '@/lib/actions/enquiries';
import { ENQUIRY_STATUSES, ENQUIRY_SOURCES, LOST_REASONS } from '@/lib/constants/enquiry';
import { buildWaLink, WA_TEMPLATES } from '@/lib/constants/whatsapp';
import { addDays } from '@/lib/utils/date';
import { fmtDate, todayISO } from '@/lib/utils/date';
import { BlockModal } from '@/components/bookings/BlockModal';
import { PaymentModal } from '@/components/payments/PaymentModal';
import type { Enquiry } from '@/lib/types/enquiry';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import type { UserRole } from '@/lib/types/profile';
import dynamic from 'next/dynamic';

const EnquiryModal = dynamic(() => import('@/components/enquiries/EnquiryModal').then(m => ({ default: m.EnquiryModal })), { ssr: false });
const EnquiryViewModal = dynamic(() => import('@/components/enquiries/EnquiryViewModal').then(m => ({ default: m.EnquiryViewModal })), { ssr: false });

interface Props {
  initialEnquiries: Enquiry[];
  heldBookings: Booking[];
  heldPayments: Payment[];
  users: Array<{ name: string; role: string }>;
  currentUser: { id: string; name: string; role: UserRole };
}

function leadAge(createdAt: string): string {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d';
  return `${days}d`;
}

export function EnquiriesClient({ initialEnquiries, heldBookings, heldPayments, users, currentUser }: Props) {
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
  const [viewEnquiry, setViewEnquiry] = useState<Enquiry | null>(null);
  const [lostDialog, setLostDialog] = useState<{ enquiry: Enquiry; reason: string; otherText: string; renurtureAfter: number | null } | null>(null);
  const [blockFor, setBlockFor] = useState<Enquiry | null>(null);
  const [payFor, setPayFor] = useState<Enquiry | null>(null);

  const heldById = useMemo(() => new Map(heldBookings.map(b => [b.id, b])), [heldBookings]);
  const paysByBooking = useMemo(() => {
    const m = new Map<string, Payment[]>();
    for (const p of heldPayments) m.set(p.bookingId, [...(m.get(p.bookingId) ?? []), p]);
    return m;
  }, [heldPayments]);

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

  const agentNames = useMemo(() => Array.from(new Set(users.map(u => u.name))).filter(Boolean), [users]);

  const handleQuickStatus = (e: Enquiry, status: string) => {
    if (status === 'lost') { setLostDialog({ enquiry: e, reason: '', otherText: '', renurtureAfter: 30 }); return; }
    startTransition(async () => {
      const result = await updateEnquiry(e.id, { status: status as Enquiry['status'] });
      if (!result.success) { toast.error(result.error); return; }
      router.refresh();
    });
  };

  const handleMarkLost = () => {
    if (!lostDialog) return;
    const enquiry = lostDialog.enquiry;
    if (!lostDialog.reason) { toast.error('Please select a loss reason'); return; }
    const resolvedReason = lostDialog.reason === 'Other' ? lostDialog.otherText.trim() : lostDialog.reason;
    if (lostDialog.reason === 'Other' && !resolvedReason) { toast.error('Please describe the reason'); return; }
    const followupDate = lostDialog.renurtureAfter ? addDays(today, lostDialog.renurtureAfter) : null;
    startTransition(async () => {
      const result = await updateEnquiry(enquiry.id, {
        status: 'lost',
        lostReason: resolvedReason,
        followupDate,
        nextAction: followupDate ? `Re-engage after ${lostDialog.renurtureAfter} days` : '',
      });
      if (!result.success) { toast.error(result.error); return; }
      setLostDialog(null);
      toast.success(`Marked as lost${followupDate ? ` — re-engage reminder set for ${lostDialog.renurtureAfter} days` : ''}`);
      router.refresh();
    });
  };

  const handleBook = (e: Enquiry) => {
    startTransition(async () => {
      const result = await bookEnquiry(e.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(`Booked · ${result.data.confirmationNumber}`);
      router.refresh();
    });
  };

  const handleRelease = (e: Enquiry) => {
    startTransition(async () => {
      const result = await releaseEnquiryHold(e.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Hold released');
      router.refresh();
    });
  };

  // KPIs
  const total = enquiries.length;
  const newCount = enquiries.filter(e => e.status === 'new').length;
  const inProgress = enquiries.filter(e => e.status === 'in_progress').length;
  const booked = enquiries.filter(e => e.status === 'booked').length;
  const lost = enquiries.filter(e => e.status === 'lost').length;
  const conversionRate = total > 0 ? Math.round((booked / total) * 100) : 0;

  const statusCounts: Record<string, number> = { all: total, new: newCount, in_progress: inProgress, booked, lost };

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Enquiries & Lead Pipeline</h2>
          <p className="text-sm text-stone-500 italic">{filtered.length} of {total} leads</p>
        </div>
        <div className="flex gap-2">
          <a href="/api/export/enquiries" className="bg-white border border-stone-300 text-stone-600 hover:bg-stone-50 px-3 py-2 text-sm flex items-center gap-1.5 transition">
            <Download size={14} /> Export CSV
          </a>
          {(isSales || isAdmin) && (
            <button onClick={() => setShowNew(true)} className="bg-emerald-900 hover:bg-emerald-800 text-amber-100 px-5 py-2.5 text-sm tracking-wider flex items-center gap-2 transition">
              <Plus size={16} /> NEW ENQUIRY
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-6 gap-3 mb-5">
        {[
          { label: 'Total Leads', val: total, color: 'text-stone-800' },
          { label: 'New', val: newCount, color: 'text-blue-700' },
          { label: 'In Progress', val: inProgress, color: 'text-amber-700' },
          { label: 'Converted', val: booked, color: 'text-emerald-700' },
          { label: 'Lost', val: lost, color: 'text-stone-500' },
          {
            label: 'Conversion Rate',
            val: `${conversionRate}%`,
            color: conversionRate >= 30 ? 'text-emerald-700' : conversionRate >= 15 ? 'text-amber-700' : 'text-red-600',
          },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-white border border-stone-200 p-4">
            <div className="text-xs text-stone-500 uppercase tracking-wider">{label}</div>
            <div className={`text-2xl mt-1 font-semibold ${color}`} style={{ fontFamily: "'Cormorant Garamond', serif" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Follow-up alert panel */}
      {(overdue.length > 0 || dueToday.length > 0) && (
        <div className="bg-amber-50 border-2 border-amber-300 p-4 mb-5">
          <h3 className="text-sm uppercase tracking-wider text-amber-900 font-medium mb-3 flex items-center gap-2">
            Follow-up Required
            <span className="bg-amber-200 text-amber-900 text-xs px-1.5 py-0.5 rounded-full font-bold">{overdue.length + dueToday.length}</span>
          </h3>
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
                    className="p-1.5 hover:bg-green-100 text-green-700 rounded" title="Send WhatsApp"><MessageCircle size={14} /></a>
                  <button onClick={() => setEditEnquiry(e)} className="p-1.5 hover:bg-stone-100 text-stone-600 rounded" title="Edit lead"><Edit2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status pill tabs + search/filter row */}
      <div className="mb-4 space-y-3">
        <div className="flex gap-1.5 flex-wrap">
          {([['all', 'All'], ...Object.entries(ENQUIRY_STATUSES).map(([k, v]) => [k, v.label])] as [string, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`px-3 py-1.5 text-xs tracking-wider transition flex items-center gap-1.5 ${filterStatus === key ? 'bg-emerald-900 text-amber-100' : 'bg-white border border-stone-300 text-stone-600 hover:bg-stone-50'}`}
            >
              {key !== 'all' && (
                <span className={`w-1.5 h-1.5 rounded-full ${ENQUIRY_STATUSES[key as Enquiry['status']]?.dot ?? 'bg-stone-400'}`} />
              )}
              {label}
              <span className={`${filterStatus === key ? 'text-amber-300' : 'text-stone-400'}`}>({statusCounts[key] ?? 0})</span>
            </button>
          ))}
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search size={14} className="absolute left-3 top-3 text-stone-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, email..." className="w-full pl-9 pr-3 py-2 border border-stone-300 text-sm focus:border-emerald-700 outline-none bg-white" />
          </div>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className="px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
            <option value="all">All Sources</option>
            {ENQUIRY_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)} className="px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
            <option value="all">All Owners</option>
            {agentNames.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-stone-200 overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-stone-400 italic">No leads match your filters</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-emerald-900 text-amber-100">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider w-[90px]">Lead #</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Contact</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Source / Type</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Stage</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Follow-up</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Next Action</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Owner</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const st = ENQUIRY_STATUSES[e.status];
                const isOverdue = e.followupDate && e.followupDate < today && (e.status === 'new' || e.status === 'in_progress');
                const age = leadAge(e.createdAt);
                const ageDays = age !== 'Today' ? Number(age.replace('d', '')) : 0;
                const ageColor = age === 'Today' ? 'text-emerald-700 font-medium' : ageDays > 14 ? 'text-red-500' : 'text-stone-400';
                return (
                  <tr key={e.id} className={`border-t border-stone-100 hover:bg-stone-50 transition-colors ${isOverdue ? 'bg-red-50/40' : ''}`}>
                    <td className="p-3">
                      <div className="font-mono text-xs text-stone-500">#{e.enquiryNumber}</div>
                      <div className={`text-xs mt-0.5 ${ageColor}`}>{age}</div>
                      {e.linkedBookingId && (
                        <div className="text-xs text-emerald-700 mt-0.5">↗ Converted</div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-stone-900">{e.name || '(No name)'}</div>
                      <div className="text-xs text-stone-500">{e.phone}</div>
                      {e.email && <div className="text-xs text-stone-400">{e.email}</div>}
                      {e.preferredDates && <div className="text-xs text-stone-400 italic mt-0.5">{e.preferredDates}</div>}
                    </td>
                    <td className="p-3">
                      <div className="text-xs font-medium text-stone-700">{e.source}</div>
                      {e.enquiryType && <div className="text-xs text-stone-500 mt-0.5">{e.enquiryType}</div>}
                      {e.numberOfRooms && <div className="text-xs text-stone-400">{e.numberOfRooms} rooms</div>}
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 inline-flex items-center gap-1 ${st.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                        {st.label}
                      </span>
                    </td>
                    <td className={`p-3 text-xs ${isOverdue ? 'text-red-700 font-medium' : 'text-stone-600'}`}>
                      {e.followupDate ? fmtDate(e.followupDate) : '—'}
                      {isOverdue && <div className="text-red-600 text-xs font-normal mt-0.5">⚠ Overdue</div>}
                    </td>
                    <td className="p-3 text-xs text-stone-600 max-w-[150px]">
                      <div className="truncate">{e.nextAction || '—'}</div>
                    </td>
                    <td className="p-3 text-xs text-stone-500">{e.createdBy}</td>
                    <td className="p-3 text-right">
                      <div className="flex gap-1 justify-end items-center">
                        <button onClick={() => setViewEnquiry(e)} className="p-1.5 hover:bg-stone-100 text-stone-600 rounded" title="View details">
                          <Eye size={13} />
                        </button>
                        <a href={buildWaLink(e.phone, WA_TEMPLATES.enquiryFollowup(e.name))} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 hover:bg-green-100 text-green-700 rounded" title="Send WhatsApp">
                          <MessageCircle size={13} />
                        </a>
                        {(isSales || isAdmin) && (
                          <>
                            <button onClick={() => setEditEnquiry(e)} className="p-1.5 hover:bg-stone-100 text-stone-600 rounded" title="Edit lead">
                              <Edit2 size={13} />
                            </button>
                            {(e.status === 'new' || e.status === 'in_progress') && (
                              <button onClick={() => setBlockFor(e)} disabled={isPending}
                                className="text-xs border border-amber-500 px-2 py-1 hover:bg-amber-50 text-amber-700 disabled:opacity-50 whitespace-nowrap">
                                Block Rooms
                              </button>
                            )}
                            {e.status === 'rooms_blocked' && (
                              <>
                                <button onClick={() => setPayFor(e)} disabled={isPending}
                                  className="text-xs border border-purple-500 px-2 py-1 hover:bg-purple-50 text-purple-700 disabled:opacity-50">
                                  Pay
                                </button>
                                <button onClick={() => handleRelease(e)} disabled={isPending}
                                  className="text-xs border border-stone-300 px-2 py-1 hover:bg-stone-100 text-stone-600 disabled:opacity-50">
                                  Release
                                </button>
                              </>
                            )}
                            {e.status === 'advance_pending' && (
                              <span className="text-xs text-purple-600 italic px-2 py-1">Awaiting Accounts</span>
                            )}
                            {e.status === 'advance_confirmed' && (
                              <button onClick={() => handleBook(e)} disabled={isPending}
                                className="text-xs border border-emerald-600 px-2 py-1 hover:bg-emerald-50 text-emerald-700 disabled:opacity-50 whitespace-nowrap">
                                Book →
                              </button>
                            )}
                            {e.status !== 'lost' && e.status !== 'booked' && e.status !== 'advance_pending' && e.status !== 'advance_confirmed' && (
                              <button onClick={() => handleQuickStatus(e, 'lost')} className="text-xs border border-red-200 px-2 py-1 hover:bg-red-50 text-red-600">
                                Lost
                              </button>
                            )}
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

      {/* Mark as Lost dialog */}
      {lostDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-1 text-stone-800">Mark Lead as Lost</h3>

            <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Loss Reason</label>
            <select value={lostDialog.reason} onChange={e => setLostDialog(d => d ? { ...d, reason: e.target.value } : null)} className={`w-full px-3 py-2 border border-stone-300 text-sm bg-white ${lostDialog.reason === 'Other' ? 'mb-2' : 'mb-4'}`}>
              <option value="">Select reason</option>
              {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            {lostDialog.reason === 'Other' && (
              <input
                autoFocus
                value={lostDialog.otherText}
                onChange={e => setLostDialog(d => d ? { ...d, otherText: e.target.value } : null)}
                placeholder="Describe the reason…"
                className="w-full px-3 py-2 border border-stone-300 text-sm mb-4 bg-white outline-none focus:border-emerald-700"
              />
            )}

            <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Re-engage Schedule</label>
            <select
              value={lostDialog.renurtureAfter ?? ''}
              onChange={e => setLostDialog(d => d ? { ...d, renurtureAfter: e.target.value ? Number(e.target.value) : null } : null)}
              className="w-full px-3 py-2 border border-stone-300 text-sm mb-4 bg-white"
            >
              <option value="">No follow-up needed</option>
              <option value="15">Re-engage in 15 days</option>
              <option value="30">Re-engage in 30 days</option>
              <option value="45">Re-engage in 45 days</option>
              <option value="60">Re-engage in 60 days</option>
              <option value="90">Re-engage in 90 days</option>
            </select>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setLostDialog(null)} className="px-4 py-2 text-sm border border-stone-300 hover:bg-stone-100">Cancel</button>
              <button onClick={handleMarkLost} disabled={isPending} className="px-4 py-2 text-sm bg-red-700 text-white hover:bg-red-800 disabled:opacity-50">Confirm Lost</button>
            </div>
          </div>
        </div>
      )}

      {viewEnquiry && <EnquiryViewModal enquiry={viewEnquiry} onClose={() => setViewEnquiry(null)} />}
      {showNew && <EnquiryModal users={users} currentUser={currentUser} onClose={() => setShowNew(false)} />}
      {editEnquiry && <EnquiryModal enquiry={editEnquiry} users={users} currentUser={currentUser} onClose={() => setEditEnquiry(null)} />}

      {blockFor && (
        <BlockModal
          currentUser={currentUser}
          existingBookings={heldBookings}
          enquiry={{ id: blockFor.id, name: blockFor.name, phone: blockFor.phone }}
          onBlocked={() => { setBlockFor(null); router.refresh(); }}
          onClose={() => setBlockFor(null)}
        />
      )}
      {payFor && payFor.heldBookingId && heldById.get(payFor.heldBookingId) && (
        <PaymentModal
          booking={heldById.get(payFor.heldBookingId)!}
          payments={paysByBooking.get(payFor.heldBookingId) ?? []}
          currentUser={currentUser}
          onClose={() => { setPayFor(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
