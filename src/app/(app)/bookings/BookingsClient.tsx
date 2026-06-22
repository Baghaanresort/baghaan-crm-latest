'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Plus, Calendar, Search, Ban, Edit2, FileText, Eye, Download, MessageCircle, CalendarClock, IndianRupee, Check, X, Send } from 'lucide-react';
import { toast } from 'sonner';
import { decideRequest, applyPostponement } from '@/lib/actions/requests';
import { sendBalanceRequest } from '@/lib/actions/transactions';
import { getEffectiveStatus, getBookingPaymentStatus } from '@/lib/utils/booking';
import { fmtDate, todayISO } from '@/lib/utils/date';
import { buildWaLink, WA_TEMPLATES } from '@/lib/constants/whatsapp';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import type { BookingRequest } from '@/lib/types/request';
import type { UserRole } from '@/lib/types/profile';
import dynamic from 'next/dynamic';

const BookingModal = dynamic(() => import('@/components/bookings/BookingModal').then(m => ({ default: m.BookingModal })), { ssr: false });
const BlockModal = dynamic(() => import('@/components/bookings/BlockModal').then(m => ({ default: m.BlockModal })), { ssr: false });
const PaymentModal = dynamic(() => import('@/components/payments/PaymentModal').then(m => ({ default: m.PaymentModal })), { ssr: false });
const FinalBillModal = dynamic(() => import('@/components/front-office/FinalBillModal').then(m => ({ default: m.FinalBillModal })), { ssr: false });
const CancelRequestModal = dynamic(() => import('@/components/bookings/RequestModals').then(m => ({ default: m.CancelRequestModal })), { ssr: false });
const PostponeRequestModal = dynamic(() => import('@/components/bookings/RequestModals').then(m => ({ default: m.PostponeRequestModal })), { ssr: false });
const RefundModal = dynamic(() => import('@/components/bookings/RequestModals').then(m => ({ default: m.RefundModal })), { ssr: false });

interface Props {
  initialBookings: Booking[];
  initialPayments: Payment[];
  initialRequests: BookingRequest[];
  users: Array<{ name: string; role: string }>;
  currentUser: { id: string; name: string; role: UserRole };
}

const STATUS_TABS = [
  { key: 'all', label: 'All', dot: '' },
  { key: 'hold', label: 'On Hold', dot: 'bg-amber-500' },
  { key: 'pending_verification', label: 'Pending Verification', dot: 'bg-purple-500' },
  { key: 'upcoming', label: 'Confirmed', dot: 'bg-blue-500' },
  { key: 'inhouse', label: 'In House', dot: 'bg-emerald-600' },
  { key: 'past', label: 'Checked Out', dot: 'bg-stone-400' },
  { key: 'cancelled', label: 'Cancelled', dot: 'bg-stone-400' },
] as const;

export function BookingsClient({ initialBookings, initialPayments, initialRequests, users, currentUser }: Props) {
  const today = todayISO();
  const role = currentUser.role;
  const searchParams = useSearchParams();
  const router = useRouter();
  const isAdmin = role === 'Admin';
  const isSalesAdmin = role === 'Sales Admin';
  // Sales Admin can do everything Sales can — fold it into isSales for capability gates.
  const isSales = role === 'Sales' || isSalesAdmin;
  const isFO = role === 'Front Office';
  const isOp = ['Kitchen', 'F&B'].includes(role);
  const canRequestChange = isSales || isAdmin;     // request cancellation / postponement
  const canApprove = isSalesAdmin || isAdmin;      // approve / reject those requests
  const canInitiateRefund = isSales || isAdmin;    // record a refund on a cancelled booking

  // Read straight from props (not frozen useState) so router.refresh() — fired on
  // tab activation and after mutations — surfaces fresh server data without a reload.
  const bookings = initialBookings;
  const payments = initialPayments;
  const requests = initialRequests;
  const [search, setSearch] = useState('');
  const [filterAgent, setFilterAgent] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [isPending, startTransition] = useTransition();

  const [showNew, setShowNew] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editHold, setEditHold] = useState<Booking | null>(null);
  const [convertHold, setConvertHold] = useState<Booking | null>(null);
  const [paymentFor, setPaymentFor] = useState<Booking | null>(null);
  const [finalBillFor, setFinalBillFor] = useState<Booking | null>(null);
  const [cancelReqFor, setCancelReqFor] = useState<Booking | null>(null);
  const [postponeFor, setPostponeFor] = useState<Booking | null>(null);
  const [refundFor, setRefundFor] = useState<Booking | null>(null);
  const [convertPrefill, setConvertPrefill] = useState<{ guestName: string; contactNumber: string; email: string; remarks: string; sourceEnquiryId: string } | null>(null);

  useEffect(() => {
    const convertId = searchParams.get('convert');
    const name = searchParams.get('name');
    const phone = searchParams.get('phone');
    const email = searchParams.get('email');
    const remarks = searchParams.get('remarks');
    if (convertId && name && phone) {
      setConvertPrefill({ guestName: name, contactNumber: phone, email: email ?? '', remarks: remarks ?? '', sourceEnquiryId: convertId });
      setShowNew(true);
      router.replace('/bookings');
    }
  }, []);

  const pStats = (b: Booking) => getBookingPaymentStatus(b, payments);
  const effStatus = (b: Booking) => getEffectiveStatus(b, payments);

  const openCancelReq = (id: string) => requests.find(r => r.bookingId === id && r.type === 'cancellation' && r.status === 'pending') ?? null;
  const openPostponeReq = (id: string) => requests.find(r => r.bookingId === id && r.type === 'postponement' && (r.status === 'pending' || r.status === 'approved')) ?? null;
  const pendingApprovals = useMemo(() => requests.filter(r => r.status === 'pending'), [requests]);
  const postponesToApply = useMemo(() => requests.filter(r => r.type === 'postponement' && r.status === 'approved'), [requests]);
  const bookingById = useMemo(() => new Map(bookings.map(b => [b.id, b])), [bookings]);

  const agentNames = useMemo(() =>
    Array.from(new Set(users.map(u => u.name))).filter(Boolean),
    [users]
  );

  // KPI strip
  const kpis = useMemo(() => {
    let arrivingToday = 0, inHouseNow = 0, departingToday = 0, onHold = 0;
    bookings.forEach(b => {
      if (b.status === 'cancelled') return; // voided — excluded from active counts
      const eff = getEffectiveStatus(b, payments);
      if (b.arrival === today) arrivingToday++;
      if (b.arrival <= today && b.departure > today && eff === 'confirmed') inHouseNow++;
      if (b.departure === today) departingToday++;
      if (eff === 'hold') onHold++;
    });
    return { total: bookings.length, arrivingToday, inHouseNow, departingToday, onHold };
  }, [bookings, payments, today]);

  // Counts for status pill tabs
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: 0, hold: 0, pending_verification: 0, upcoming: 0, inhouse: 0, past: 0, cancelled: 0 };
    bookings.forEach(b => {
      if (b.status === 'cancelled') { c['cancelled']!++; return; } // shown only under the Cancelled tab
      c['all']!++;
      const eff = getEffectiveStatus(b, payments);
      if (eff === 'hold') c['hold']!++;
      if (eff === 'pending_verification') c['pending_verification']!++;
      if (b.arrival > today && eff === 'confirmed') c['upcoming']!++;
      if (b.arrival <= today && b.departure > today && eff === 'confirmed') c['inhouse']!++;
      if (b.departure <= today) c['past']!++;
    });
    return c;
  }, [bookings, payments, today]);

  const filtered = useMemo(() => {
    return bookings.filter(b => {
      const eff = effStatus(b);
      if (filterAgent !== 'all' && b.createdBy !== filterAgent) return false;
      // Cancelled bookings are kept as a record but live only under the Cancelled tab.
      if (filterStatus === 'cancelled') { if (b.status !== 'cancelled') return false; }
      else if (b.status === 'cancelled') return false;
      if (filterStatus === 'hold' && eff !== 'hold') return false;
      if (filterStatus === 'pending_verification' && eff !== 'pending_verification') return false;
      if (filterStatus === 'upcoming' && (b.arrival <= today || eff !== 'confirmed')) return false;
      if (filterStatus === 'inhouse' && !(b.arrival <= today && b.departure > today && eff === 'confirmed')) return false;
      if (filterStatus === 'past' && b.departure > today) return false;
      if (filterPayment !== 'all') {
        const ps = pStats(b);
        if (filterPayment === 'unpaid' && ps.totalPaid > 0) return false;
        if (filterPayment === 'partial' && (ps.totalPaid === 0 || ps.balance <= 0)) return false;
        if (filterPayment === 'paid' && !(ps.billAmount > 0 && ps.balance <= 0)) return false;
        if (filterPayment === 'overpaid' && ps.balance >= 0) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!`${b.guestName} ${b.contactNumber} ${b.confirmationNumber} ${b.email} ${b.companyName}`.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => b.arrival.localeCompare(a.arrival));
  }, [bookings, search, filterAgent, filterStatus, filterPayment, today]);

  const handleDecide = (reqId: string, decision: 'approved' | 'rejected') => {
    startTransition(async () => {
      const res = await decideRequest(reqId, decision);
      if (!res.success) { toast.error(res.error); return; }
      toast.success(decision === 'approved' ? 'Request approved' : 'Request rejected');
    });
  };

  const handleApply = (reqId: string) => {
    startTransition(async () => {
      const res = await applyPostponement(reqId);
      if (!res.success) { toast.error(res.error); return; }
      toast.success('Booking postponed');
    });
  };

  const handleRequestBalance = (b: Booking) => {
    startTransition(async () => {
      const res = await sendBalanceRequest(b.id);
      if (!res.success) { toast.error(res.error); return; }
      toast.success('Balance payment link sent');
    });
  };

  const handlePrint = (b: Booking) => {
    const win = window.open(`/api/print/voucher?bookingId=${b.id}`, '_blank');
    win?.addEventListener('load', () => setTimeout(() => win.print(), 300));
  };

  const handleView = (b: Booking) => {
    window.open(`/api/print/voucher?bookingId=${b.id}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Reservations</h2>
          <p className="text-sm text-stone-500 italic">{filtered.length} of {bookings.length} reservations</p>
        </div>
        <div className="flex gap-2">
          <a href="/api/export/bookings" className="bg-white border border-stone-300 text-stone-600 hover:bg-stone-50 px-3 py-2 text-sm flex items-center gap-1.5 transition">
            <Download size={14} /> Export CSV
          </a>
          {(isSales || isFO || isAdmin) && (
            <>
              <button onClick={() => setShowBlock(true)} className="bg-white border-2 border-amber-600 text-amber-700 hover:bg-amber-50 px-4 py-2.5 text-sm tracking-wider flex items-center gap-2 transition">
                <Calendar size={16} /> BLOCK ROOMS
              </button>
              <button onClick={() => setShowNew(true)} className="bg-emerald-900 hover:bg-emerald-800 text-amber-100 px-5 py-2.5 text-sm tracking-wider flex items-center gap-2 transition">
                <Plus size={16} /> NEW RESERVATION
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Total Reservations', val: kpis.total, color: 'text-stone-800' },
          { label: 'Arriving Today', val: kpis.arrivingToday, color: 'text-blue-700' },
          { label: 'In House', val: kpis.inHouseNow, color: 'text-emerald-700' },
          { label: 'Departing Today', val: kpis.departingToday, color: 'text-amber-700' },
          { label: 'On Hold', val: kpis.onHold, color: kpis.onHold > 0 ? 'text-orange-600' : 'text-stone-500' },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-white border border-stone-200 p-4">
            <div className="text-xs text-stone-500 uppercase tracking-wider">{label}</div>
            <div className={`text-2xl mt-1 font-semibold ${color}`} style={{ fontFamily: "'Cormorant Garamond', serif" }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Requests needing attention — approvals (Sales Admin/Admin) + approved postponements to apply */}
      {((canApprove && pendingApprovals.length > 0) || (canRequestChange && postponesToApply.length > 0)) && (
        <div className="mb-5 border border-amber-300 bg-amber-50">
          <div className="px-4 py-2 bg-amber-100 text-amber-900 text-xs uppercase tracking-wider font-medium">Requests needing attention</div>
          <div className="divide-y divide-amber-200">
            {canApprove && pendingApprovals.map(r => {
              const b = bookingById.get(r.bookingId);
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm flex-wrap">
                  <div className="min-w-0">
                    <span className={`text-xs px-1.5 py-0.5 mr-2 ${r.type === 'cancellation' ? 'bg-red-100 text-red-700' : 'bg-amber-200 text-amber-800'}`}>{r.type === 'cancellation' ? 'Cancel' : 'Postpone'}</span>
                    <span className="font-medium">{b?.guestName ?? r.bookingId}</span>
                    <span className="text-stone-500 text-xs ml-2 font-mono">{b?.confirmationNumber}</span>
                    {r.type === 'postponement' && r.payload && <span className="text-xs text-stone-600 ml-2">{fmtDate(r.payload.arrival)} → {fmtDate(r.payload.departure)}</span>}
                    {r.reason && <span className="text-xs text-stone-500 italic ml-2">“{r.reason}”</span>}
                    <span className="text-xs text-stone-400 ml-2">by {r.requestedBy}</span>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => handleDecide(r.id, 'approved')} disabled={isPending} className="inline-flex items-center gap-1 text-xs bg-emerald-700 text-white px-3 py-1.5 hover:bg-emerald-800 disabled:opacity-50"><Check size={13} /> Approve</button>
                    <button onClick={() => handleDecide(r.id, 'rejected')} disabled={isPending} className="inline-flex items-center gap-1 text-xs border border-stone-300 text-stone-600 px-3 py-1.5 hover:bg-stone-100 disabled:opacity-50"><X size={13} /> Reject</button>
                  </div>
                </div>
              );
            })}
            {canRequestChange && postponesToApply.map(r => {
              const b = bookingById.get(r.bookingId);
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm flex-wrap">
                  <div className="min-w-0">
                    <span className="text-xs px-1.5 py-0.5 mr-2 bg-emerald-100 text-emerald-700">Postpone approved</span>
                    <span className="font-medium">{b?.guestName ?? r.bookingId}</span>
                    <span className="text-stone-500 text-xs ml-2 font-mono">{b?.confirmationNumber}</span>
                    {r.payload && <span className="text-xs text-stone-600 ml-2">→ {fmtDate(r.payload.arrival)} → {fmtDate(r.payload.departure)}</span>}
                  </div>
                  <button onClick={() => handleApply(r.id)} disabled={isPending} className="inline-flex items-center gap-1 text-xs bg-amber-600 text-white px-3 py-1.5 hover:bg-amber-700 disabled:opacity-50 flex-shrink-0"><CalendarClock size={13} /> Apply dates</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status pill tabs + filter row */}
      <div className="mb-4 space-y-3">
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_TABS.map(({ key, label, dot }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`px-3 py-1.5 text-xs tracking-wider transition flex items-center gap-1.5 ${filterStatus === key ? 'bg-emerald-900 text-amber-100' : 'bg-white border border-stone-300 text-stone-600 hover:bg-stone-50'}`}
            >
              {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
              {label}
              <span className={`${filterStatus === key ? 'text-amber-300' : 'text-stone-400'}`}>({statusCounts[key] ?? 0})</span>
            </button>
          ))}
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 relative min-w-[240px]">
            <Search size={14} className="absolute left-3 top-3 text-stone-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, confirmation #..."
              className="w-full pl-9 pr-3 py-2 border border-stone-300 text-sm focus:border-emerald-700 outline-none bg-white" />
          </div>
          <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)} className="px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
            <option value="all">All Owners</option>
            {agentNames.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {!isOp && (
            <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} className="px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
              <option value="all">All Payment Statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partially Paid</option>
              <option value="paid">Fully Settled</option>
              <option value="overpaid">Overpaid</option>
            </select>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-stone-200 overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-stone-400 italic">No reservations match your filters</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-emerald-900 text-amber-100">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Confirmation #</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Guest</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Stay</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Status</th>
                {!isOp && <th className="text-right p-3 text-xs uppercase tracking-wider">Total</th>}
                {!isOp && <th className="text-right p-3 text-xs uppercase tracking-wider">Paid</th>}
                {!isOp && <th className="text-right p-3 text-xs uppercase tracking-wider">Balance</th>}
                <th className="text-left p-3 text-xs uppercase tracking-wider">Owner</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => {
                const ps = pStats(b);
                const eff = effStatus(b);
                // +PAY / BILL disappear once any payment (verified or pending) has been recorded.
                const paymentRecorded = ps.totalPaid > 0 || ps.totalUnverified > 0;
                const timeStatus = b.departure <= today ? 'past' : b.arrival <= today ? 'inhouse' : 'upcoming';

                let statusColor = 'bg-stone-100 text-stone-600';
                let statusLabel = 'Checked Out';
                let statusDot = 'bg-stone-400';
                if (eff === 'hold') { statusColor = 'bg-amber-100 text-amber-800'; statusLabel = 'On Hold'; statusDot = 'bg-amber-500'; }
                else if (eff === 'pending_verification') { statusColor = 'bg-purple-100 text-purple-800'; statusLabel = 'Pending Verification'; statusDot = 'bg-purple-500'; }
                else if (timeStatus === 'inhouse') { statusColor = 'bg-emerald-100 text-emerald-800'; statusLabel = 'In House'; statusDot = 'bg-emerald-600'; }
                else if (timeStatus === 'upcoming') { statusColor = 'bg-blue-100 text-blue-800'; statusLabel = 'Confirmed'; statusDot = 'bg-blue-500'; }
                if (b.status === 'cancelled') { statusColor = 'bg-stone-200 text-stone-500'; statusLabel = 'Cancelled'; statusDot = 'bg-stone-400'; }

                let payBadgeLabel = 'Unpaid';
                let payBadgeColor = 'bg-red-100 text-red-700';
                if (ps.totalUnverified > 0 && ps.totalPaid === 0) { payBadgeLabel = 'Awaiting Verification'; payBadgeColor = 'bg-purple-100 text-purple-700'; }
                else if (ps.billAmount > 0 && ps.balance <= 0) { payBadgeLabel = 'Settled'; payBadgeColor = 'bg-emerald-100 text-emerald-700'; }
                else if (ps.totalPaid > 0) { payBadgeLabel = 'Partially Paid'; payBadgeColor = 'bg-amber-100 text-amber-700'; }

                const rowHighlight = eff === 'hold' ? 'bg-amber-50/30' : eff === 'pending_verification' ? 'bg-purple-50/30' : '';

                return (
                  <tr key={b.id} className={`border-t border-stone-100 hover:bg-stone-50 transition-colors ${rowHighlight}`}>
                    <td className="p-3">
                      <div className="font-mono text-xs text-stone-700">{b.confirmationNumber}</div>
                      {b.sourceEnquiryId && <div className="text-xs text-blue-600 mt-0.5">↙ Lead</div>}
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-stone-900">{b.guestName}</div>
                      <a href={buildWaLink(b.contactNumber, WA_TEMPLATES.enquiryGreeting(b.guestName))} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-stone-500 hover:text-green-700 flex items-center gap-1 w-fit transition-colors">
                        <MessageCircle size={11} /> {b.contactNumber}
                      </a>
                      {b.companyName && <div className="text-xs text-stone-400 italic mt-0.5">{b.companyName}</div>}
                    </td>
                    <td className="p-3 text-xs">
                      <div className="text-stone-800">{fmtDate(b.arrival)} → {fmtDate(b.departure)}</div>
                      <div className="text-stone-500 mt-0.5">{b.nights}n · {b.rooms?.length} rooms · {b.adults}A{b.children > 0 ? `/${b.children}C` : ''}</div>
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 inline-flex items-center gap-1 ${statusColor}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot}`} />
                        {statusLabel}
                      </span>
                      {!isOp && (
                        <div className="mt-1">
                          <span className={`text-xs px-1.5 py-0.5 ${payBadgeColor}`}>{payBadgeLabel}</span>
                        </div>
                      )}
                      {(() => {
                        const cr = openCancelReq(b.id);
                        const pr = openPostponeReq(b.id);
                        if (!cr && !pr) return null;
                        return (
                          <div className="mt-1 flex flex-col gap-0.5 items-start">
                            {cr && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700">Cancellation pending</span>}
                            {pr && <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-800">Postpone {pr.status === 'approved' ? 'approved' : 'pending'}</span>}
                          </div>
                        );
                      })()}
                    </td>
                    {!isOp && <td className="p-3 text-right text-stone-700 text-xs">₹{b.totalAmount.toLocaleString('en-IN')}</td>}
                    {!isOp && (
                      <td className={`p-3 text-right text-xs ${ps.totalPaid > 0 ? 'text-emerald-700' : 'text-stone-400'}`}>
                        ₹{ps.totalPaid.toLocaleString('en-IN')}
                      </td>
                    )}
                    {!isOp && (
                      <td className={`p-3 text-right text-xs font-medium ${ps.billAmount > 0 && ps.balance <= 0 ? 'text-emerald-700' : ps.totalPaid > 0 ? 'text-amber-700' : 'text-red-700'}`}>
                        ₹{ps.balance.toLocaleString('en-IN')}
                      </td>
                    )}
                    <td className="p-3 text-xs text-stone-500">{b.createdBy}</td>
                    <td className="p-3 text-right">
                      <div className="flex gap-1 justify-end items-center">
                        {(isSales || isFO || isAdmin) && (
                          <button onClick={() => b.status === 'hold' ? setEditHold(b) : setEditBooking(b)} title={b.status === 'hold' ? 'Edit hold' : 'Edit reservation'} className="p-1.5 hover:bg-stone-100 text-stone-600 rounded transition-colors">
                            <Edit2 size={13} />
                          </button>
                        )}
                        {(isSales || isFO || isAdmin) && !paymentRecorded && (
                          <button onClick={() => setPaymentFor(b)} title="Add payment" className="text-xs bg-emerald-700 text-white px-2 py-1 hover:bg-emerald-800 transition-colors">
                            +PAY
                          </button>
                        )}
                        {(isFO || isAdmin) && !paymentRecorded && (
                          <button onClick={() => setFinalBillFor(b)} title="Final bill" className="text-xs bg-blue-700 text-white px-2 py-1 hover:bg-blue-800 transition-colors">
                            BILL
                          </button>
                        )}
                        {(isSales || isFO || isAdmin) && (
                          <>
                            <button onClick={() => handleView(b)} title="View voucher" className="p-1.5 hover:bg-stone-100 text-stone-600 rounded transition-colors">
                              <Eye size={13} />
                            </button>
                            <button onClick={() => handlePrint(b)} title="Print voucher" className="p-1.5 hover:bg-stone-100 text-stone-600 rounded transition-colors">
                              <FileText size={13} />
                            </button>
                          </>
                        )}
                        {(isSales || isFO || isAdmin) && eff === 'confirmed' && b.status !== 'cancelled' && b.bookingType !== 'corporate' && ps.balance > 0 && (
                          <button onClick={() => handleRequestBalance(b)} disabled={isPending} title="Request balance payment" className="inline-flex items-center gap-1 text-xs border border-emerald-300 text-emerald-700 px-2 py-1 hover:bg-emerald-50 disabled:opacity-50 transition-colors">
                            <Send size={12} /> Balance
                          </button>
                        )}
                        {canRequestChange && b.status !== 'cancelled' && b.bookingType !== 'corporate' && (
                          <>
                            {!openPostponeReq(b.id) && (
                              <button onClick={() => setPostponeFor(b)} disabled={isPending} title="Request postponement" className="p-1.5 hover:bg-amber-100 text-amber-600 rounded disabled:opacity-50 transition-colors">
                                <CalendarClock size={13} />
                              </button>
                            )}
                            {!openCancelReq(b.id) && (
                              <button onClick={() => setCancelReqFor(b)} disabled={isPending} title="Request cancellation" className="p-1.5 hover:bg-red-100 text-red-600 rounded disabled:opacity-50 transition-colors">
                                <Ban size={13} />
                              </button>
                            )}
                          </>
                        )}
                        {canInitiateRefund && b.status === 'cancelled' && b.bookingType !== 'corporate' && (
                          <button onClick={() => setRefundFor(b)} disabled={isPending} title="Initiate refund" className="inline-flex items-center gap-1 text-xs border border-purple-300 text-purple-700 px-2 py-1 hover:bg-purple-50 disabled:opacity-50 transition-colors">
                            <IndianRupee size={12} /> Refund
                          </button>
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

      {showNew && <BookingModal users={users} currentUser={currentUser} existingBookings={bookings} prefill={convertPrefill} sourceEnquiryId={convertPrefill?.sourceEnquiryId ?? null} onClose={() => { setShowNew(false); setConvertPrefill(null); }} />}
      {showBlock && <BlockModal currentUser={currentUser} existingBookings={bookings} onClose={() => setShowBlock(false)} />}
      {editHold && <BlockModal booking={editHold} currentUser={currentUser} existingBookings={bookings} onConvert={(h) => { setEditHold(null); setConvertHold(h); }} onClose={() => setEditHold(null)} />}
      {convertHold && <BookingModal booking={convertHold} convertFromHold users={users} currentUser={currentUser} existingBookings={bookings} onClose={() => setConvertHold(null)} />}
      {editBooking && <BookingModal booking={editBooking} users={users} currentUser={currentUser} existingBookings={bookings} onClose={() => setEditBooking(null)} />}
      {paymentFor && <PaymentModal booking={paymentFor} currentUser={currentUser} payments={payments.filter(p => p.bookingId === paymentFor.id)} onClose={() => setPaymentFor(null)} />}
      {finalBillFor && <FinalBillModal booking={finalBillFor} currentUser={currentUser} payments={payments.filter(p => p.bookingId === finalBillFor.id)} onClose={() => setFinalBillFor(null)} />}
      {cancelReqFor && <CancelRequestModal booking={cancelReqFor} onClose={() => setCancelReqFor(null)} />}
      {postponeFor && <PostponeRequestModal booking={postponeFor} onClose={() => setPostponeFor(null)} />}
      {refundFor && <RefundModal booking={refundFor} payments={payments.filter(p => p.bookingId === refundFor.id)} onClose={() => setRefundFor(null)} />}
    </div>
  );
}
