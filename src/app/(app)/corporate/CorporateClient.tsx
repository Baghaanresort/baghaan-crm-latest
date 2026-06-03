'use client';

import { useState, useMemo, useTransition } from 'react';
import { Plus, Search, Trash2, Edit2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { deleteBooking } from '@/lib/actions/bookings';
import { sendCostSheet, markCostSheetAccepted, generateProformaInvoice } from '@/lib/actions/corporate';
import { CORPORATE_STAGES } from '@/lib/constants/corporate';
import { getBookingPaymentStatus } from '@/lib/utils/booking';
import { fmtDate } from '@/lib/utils/date';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import type { UserRole } from '@/lib/types/profile';
import dynamic from 'next/dynamic';

const CostSheetModal = dynamic(() => import('@/components/corporate/CostSheetModal').then(m => ({ default: m.CostSheetModal })), { ssr: false });
const ProformaInvoicePreview = dynamic(() => import('@/components/corporate/ProformaInvoicePreview').then(m => ({ default: m.ProformaInvoicePreview })), { ssr: false });
const PaymentModal = dynamic(() => import('@/components/payments/PaymentModal').then(m => ({ default: m.PaymentModal })), { ssr: false });
const CorporateBookingModal = dynamic(() => import('@/components/corporate/CorporateBookingModal').then(m => ({ default: m.CorporateBookingModal })), { ssr: false });

interface Props {
  initialBookings: Booking[];
  initialPayments: Payment[];
  users: Array<{ name: string; role: string }>;
  currentUser: { id: string; name: string; role: UserRole };
}

export function CorporateClient({ initialBookings, initialPayments, users, currentUser }: Props) {
  const bookings = initialBookings;
  const payments = initialPayments;
  const role = currentUser.role;
  const isSales = role === 'Sales';
  const isAdmin = role === 'Admin';
  const canEdit = isSales || role === 'Front Office' || isAdmin;

  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [isPending, startTransition] = useTransition();

  const [showNew, setShowNew] = useState(false);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [costSheetFor, setCostSheetFor] = useState<Booking | null>(null);
  const [piFor, setPiFor] = useState<Booking | null>(null);
  const [paymentFor, setPaymentFor] = useState<Booking | null>(null);

  const pStats = (b: Booking) => getBookingPaymentStatus(b, payments);

  const filtered = useMemo(() => {
    return bookings.filter(b => {
      if (filterStage !== 'all' && b.corporateStage !== filterStage) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!`${b.companyName} ${b.contactName} ${b.contactNumber} ${b.confirmationNumber} ${b.proformaInvoice?.piNumber ?? ''}`.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.arrival ?? '').localeCompare(a.arrival ?? ''));
  }, [bookings, search, filterStage]);

  const summary = useMemo(() => {
    const pipeline = bookings.filter(b => !['completed'].includes(b.corporateStage ?? ''));
    const pipelineValue = pipeline.reduce((s, b) => s + b.totalAmount, 0);
    const awaitingAdvance = bookings.filter(b => b.corporateStage === 'pi_generated' && pStats(b).totalPaid === 0);
    const advanceValue = awaitingAdvance.reduce((s, b) => s + (b.proformaInvoice?.advanceRequired ?? 0), 0);
    return { pipelineValue, pipelineCount: pipeline.length, awaitingAdvance: awaitingAdvance.length, advanceValue };
  }, [bookings, payments]);

  const handleSend = (b: Booking) => {
    startTransition(async () => {
      const result = await sendCostSheet(b.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Cost sheet marked as sent');
    });
  };

  const handleAccept = (b: Booking) => {
    startTransition(async () => {
      const result = await markCostSheetAccepted(b.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Cost sheet accepted');
    });
  };

  const handleGenPI = (b: Booking) => {
    startTransition(async () => {
      const result = await generateProformaInvoice(b.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(`Proforma Invoice ${result.data.piNumber} generated`);
      setTimeout(() => setPiFor(b), 100);
    });
  };

  const handleDelete = (b: Booking) => {
    if (!confirm('Delete this corporate booking? This cannot be undone.')) return;
    startTransition(async () => {
      const result = await deleteBooking(b.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Booking deleted');
    });
  };

  const handlePrintPI = (b: Booking) => {
    const win = window.open(`/api/print/pi?bookingId=${b.id}`, '_blank');
    win?.addEventListener('load', () => setTimeout(() => win.print(), 300));
  };

  const handlePrintCostSheet = (b: Booking) => {
    const win = window.open(`/api/print/cost-sheet?bookingId=${b.id}`, '_blank');
    win?.addEventListener('load', () => setTimeout(() => win.print(), 300));
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Corporate / Group Bookings</h2>
          <p className="text-sm text-stone-500 italic">Cost sheet → Proforma invoice → Advance → Confirmed</p>
        </div>
        {(isSales || isAdmin) && (
          <button onClick={() => setShowNew(true)} className="bg-emerald-900 hover:bg-emerald-800 text-amber-100 px-5 py-2.5 text-sm tracking-wider flex items-center gap-2 transition">
            <Plus size={16} /> NEW CORPORATE BOOKING
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[['Active Pipeline', summary.pipelineCount, `₹${summary.pipelineValue.toLocaleString('en-IN')} total`, false],
          ['Awaiting Advance', summary.awaitingAdvance, `₹${summary.advanceValue.toLocaleString('en-IN')} to collect`, summary.awaitingAdvance > 0],
          ['Total Corporate', bookings.length, 'all time', false]].map(([label, val, sub, accent]) => (
          <div key={String(label)} className="bg-white border border-stone-200 p-4">
            <div className="text-xs text-stone-500 uppercase tracking-wider">{label}</div>
            <div className={`text-2xl mt-1 font-semibold ${accent ? 'text-amber-700' : 'text-emerald-900'}`} style={{ fontFamily: "'Cormorant Garamond', serif" }}>{val}</div>
            <div className="text-xs text-stone-400 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-3 text-stone-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company, contact, PI number..." className="w-full pl-9 pr-3 py-2 border border-stone-300 text-sm focus:border-emerald-700 outline-none bg-white" />
        </div>
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)} className="px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
          <option value="all">All Stages</option>
          {Object.entries(CORPORATE_STAGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-stone-200 overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-stone-400 italic">No corporate bookings match filters</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-emerald-900 text-amber-100">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Company</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Contact</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Stay</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Stage</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Value</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Paid</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => {
                const stage = b.corporateStage ?? 'inquiry';
                const stageInfo = CORPORATE_STAGES[stage];
                const ps = pStats(b);
                return (
                  <tr key={b.id} className="border-t border-stone-100 hover:bg-stone-50">
                    <td className="p-3">
                      <div className="font-medium">{b.companyName || '—'}</div>
                      <div className="text-xs font-mono text-stone-500">{b.confirmationNumber}</div>
                      {b.proformaInvoice?.piNumber && <div className="text-xs text-purple-700 font-mono">{b.proformaInvoice.piNumber}</div>}
                    </td>
                    <td className="p-3 text-xs">
                      <div>{b.contactName || '—'}</div>
                      <div className="text-stone-500">{b.contactNumber}</div>
                    </td>
                    <td className="p-3 text-xs">
                      <div>{fmtDate(b.arrival)} → {fmtDate(b.departure)}</div>
                      <div className="text-stone-500">{b.nights}n · {b.rooms?.length} rooms</div>
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 ${stageInfo?.color ?? ''}`}>{stageInfo?.label ?? stage}</span>
                    </td>
                    <td className="p-3 text-right">₹{b.totalAmount.toLocaleString('en-IN')}</td>
                    <td className="p-3 text-right text-xs text-emerald-700">₹{ps.totalPaid.toLocaleString('en-IN')}</td>
                    <td className="p-3 text-right">
                      <div className="flex gap-1 justify-end flex-wrap">
                        {canEdit && (
                          <>
                            <button onClick={() => setCostSheetFor(b)} className="text-xs bg-stone-700 text-white px-2 py-1 hover:bg-stone-800">COST SHEET</button>
                            {(stage === 'inquiry' || stage === 'cost_sheet_draft') && <button onClick={() => handleSend(b)} disabled={isPending} className="text-xs bg-blue-700 text-white px-2 py-1 hover:bg-blue-800 disabled:opacity-50">SEND</button>}
                            {stage === 'cost_sheet_sent' && <button onClick={() => handleAccept(b)} disabled={isPending} className="text-xs bg-purple-700 text-white px-2 py-1 hover:bg-purple-800 disabled:opacity-50">ACCEPTED</button>}
                            {(stage === 'cost_sheet_accepted' || stage === 'pi_generated') && (
                              <button onClick={() => setPaymentFor(b)} className="text-xs bg-emerald-700 text-white px-2 py-1 hover:bg-emerald-800">+PAY</button>
                            )}
                          </>
                        )}
                        {(isSales || isAdmin) && stage !== 'pi_generated' && stage !== 'advance_paid' && stage !== 'completed' && (
                          <button onClick={() => handleGenPI(b)} disabled={isPending} className="text-xs bg-amber-600 text-white px-2 py-1 hover:bg-amber-700 disabled:opacity-50">GEN PI</button>
                        )}
                        {b.proformaInvoice && (
                          <>
                            <button onClick={() => setPiFor(b)} className="p-1.5 hover:bg-purple-100 text-purple-700 rounded" title="View PI"><FileText size={12} /></button>
                            <button onClick={() => handlePrintPI(b)} className="text-xs border border-purple-300 text-purple-700 px-2 py-1 hover:bg-purple-50">PDF</button>
                          </>
                        )}
                        {canEdit && <button onClick={() => setEditBooking(b)} className="p-1.5 hover:bg-stone-100 rounded" title="Edit"><Edit2 size={12} /></button>}
                        {(isSales || isAdmin) && <button onClick={() => handleDelete(b)} disabled={isPending} className="p-1.5 hover:bg-red-100 text-red-600 rounded disabled:opacity-50" title="Delete"><Trash2 size={12} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <CorporateBookingModal users={users} currentUser={currentUser} existingBookings={bookings} onClose={() => setShowNew(false)} />}
      {editBooking && <CorporateBookingModal booking={editBooking} users={users} currentUser={currentUser} existingBookings={bookings} onClose={() => setEditBooking(null)} />}
      {costSheetFor && <CostSheetModal booking={costSheetFor} currentUser={currentUser} onClose={() => setCostSheetFor(null)} />}
      {piFor && <ProformaInvoicePreview booking={piFor} onClose={() => setPiFor(null)} />}
      {paymentFor && <PaymentModal booking={paymentFor} currentUser={currentUser} payments={payments.filter(p => p.bookingId === paymentFor.id)} onClose={() => setPaymentFor(null)} />}
    </div>
  );
}
