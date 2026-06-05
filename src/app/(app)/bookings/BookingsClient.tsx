'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Plus, Calendar, Search, Trash2, Edit2, FileText, Download, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { deleteBooking } from '@/lib/actions/bookings';
import { getEffectiveStatus, getBookingPaymentStatus } from '@/lib/utils/booking';
import { fmtDate, todayISO } from '@/lib/utils/date';
import { buildWaLink, WA_TEMPLATES } from '@/lib/constants/whatsapp';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import type { UserRole } from '@/lib/types/profile';
import dynamic from 'next/dynamic';

const BookingModal = dynamic(() => import('@/components/bookings/BookingModal').then(m => ({ default: m.BookingModal })), { ssr: false });
const BlockModal = dynamic(() => import('@/components/bookings/BlockModal').then(m => ({ default: m.BlockModal })), { ssr: false });
const PaymentModal = dynamic(() => import('@/components/payments/PaymentModal').then(m => ({ default: m.PaymentModal })), { ssr: false });
const FinalBillModal = dynamic(() => import('@/components/front-office/FinalBillModal').then(m => ({ default: m.FinalBillModal })), { ssr: false });

interface Props {
  initialBookings: Booking[];
  initialPayments: Payment[];
  users: Array<{ name: string; role: string }>;
  currentUser: { id: string; name: string; role: UserRole };
}

export function BookingsClient({ initialBookings, initialPayments, users, currentUser }: Props) {
  const today = todayISO();
  const role = currentUser.role;
  const searchParams = useSearchParams();
  const router = useRouter();
  const isAdmin = role === 'Admin';
  const isSales = role === 'Sales';
  const isFO = role === 'Front Office';
  const isOp = ['Kitchen', 'F&B'].includes(role);

  const [bookings] = useState(initialBookings);
  const [payments] = useState(initialPayments);
  const [search, setSearch] = useState('');
  const [filterAgent, setFilterAgent] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [isPending, startTransition] = useTransition();

  const [showNew, setShowNew] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [paymentFor, setPaymentFor] = useState<Booking | null>(null);
  const [voucherFor, setVoucherFor] = useState<Booking | null>(null);
  const [finalBillFor, setFinalBillFor] = useState<Booking | null>(null);
  const [convertPrefill, setConvertPrefill] = useState<{ guestName: string; contactNumber: string; email: string; sourceEnquiryId: string } | null>(null);

  useEffect(() => {
    const convertId = searchParams.get('convert');
    const name = searchParams.get('name');
    const phone = searchParams.get('phone');
    const email = searchParams.get('email');
    if (convertId && name && phone) {
      setConvertPrefill({ guestName: name, contactNumber: phone, email: email ?? '', sourceEnquiryId: convertId });
      setShowNew(true);
      router.replace('/bookings');
    }
  }, []);

  const pStats = (b: Booking) => getBookingPaymentStatus(b, payments);
  const effStatus = (b: Booking) => getEffectiveStatus(b, payments);

  const agentNames = useMemo(() =>
    Array.from(new Set([...users.map(u => u.name), ...bookings.map(b => b.createdBy)])).filter(Boolean),
    [users, bookings]
  );

  const filtered = useMemo(() => {
    return bookings.filter(b => {
      const eff = effStatus(b);
      if (filterAgent !== 'all' && b.createdBy !== filterAgent) return false;
      if (filterStatus === 'hold' && eff !== 'hold') return false;
      if (filterStatus === 'pending_verification' && eff !== 'pending_verification') return false;
      if (filterStatus === 'upcoming' && (b.arrival <= today || eff !== 'confirmed')) return false;
      if (filterStatus === 'inhouse' && !(b.arrival <= today && b.departure > today && eff === 'confirmed')) return false;
      if (filterStatus === 'past' && b.departure > today) return false;
      if (filterPayment !== 'all') {
        const ps = pStats(b);
        if (filterPayment === 'unpaid' && ps.totalPaid > 0) return false;
        if (filterPayment === 'partial' && (ps.totalPaid === 0 || ps.balance <= 0)) return false;
        if (filterPayment === 'paid' && ps.balance > 0) return false;
        if (filterPayment === 'overpaid' && ps.balance >= 0) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!`${b.guestName} ${b.contactNumber} ${b.confirmationNumber} ${b.email} ${b.companyName}`.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => b.arrival.localeCompare(a.arrival));
  }, [bookings, search, filterAgent, filterStatus, filterPayment, today]);

  const handleDelete = (id: string) => {
    if (!confirm('Delete this booking? This cannot be undone.')) return;
    startTransition(async () => {
      const result = await deleteBooking(id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Booking deleted');
    });
  };

  const handlePrint = (b: Booking) => {
    const win = window.open(`/api/print/voucher?bookingId=${b.id}`, '_blank');
    win?.addEventListener('load', () => setTimeout(() => win.print(), 300));
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>All Bookings</h2>
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
              <button onClick={() => setShowNew(true)} className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 text-sm tracking-wider flex items-center gap-2 transition">
                <Plus size={16} /> NEW BOOKING
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="flex-1 relative min-w-[240px]">
          <Search size={14} className="absolute left-3 top-3 text-stone-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, confirmation #, email..."
            className="w-full pl-9 pr-3 py-2 border border-stone-300 text-sm focus:border-emerald-700 outline-none bg-white" />
        </div>
        <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)} className="px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
          <option value="all">All Agents</option>
          {agentNames.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
          <option value="all">All Statuses</option>
          <option value="hold">On Hold</option>
          <option value="pending_verification">Pending Verification</option>
          <option value="upcoming">Confirmed Upcoming</option>
          <option value="inhouse">In House</option>
          <option value="past">Past</option>
        </select>
        {!isOp && (
          <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)} className="px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
            <option value="all">All Payment Statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial Paid</option>
            <option value="paid">Fully Paid</option>
            <option value="overpaid">Overpaid</option>
          </select>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-stone-200 overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-stone-400 italic">No bookings match your filters</div>
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
                <th className="text-left p-3 text-xs uppercase tracking-wider">Agent</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => {
                const ps = pStats(b);
                const eff = effStatus(b);
                const timeStatus = b.departure <= today ? 'past' : b.arrival <= today ? 'inhouse' : 'upcoming';
                let statusColor = 'bg-stone-100 text-stone-600';
                let statusLabel = 'Past';
                if (eff === 'hold') { statusColor = 'bg-amber-100 text-amber-800'; statusLabel = 'On Hold'; }
                else if (eff === 'pending_verification') { statusColor = 'bg-purple-100 text-purple-800'; statusLabel = 'Pending Verification'; }
                else if (timeStatus === 'inhouse') { statusColor = 'bg-emerald-100 text-emerald-800'; statusLabel = 'In House'; }
                else if (timeStatus === 'upcoming') { statusColor = 'bg-blue-100 text-blue-800'; statusLabel = 'Confirmed'; }
                const payColor = ps.balance <= 0 ? 'text-emerald-700' : ps.totalPaid > 0 ? 'text-amber-700' : 'text-red-700';
                return (
                  <tr key={b.id} className={`border-t border-stone-100 hover:bg-stone-50 ${eff === 'hold' ? 'bg-amber-50/40' : eff === 'pending_verification' ? 'bg-purple-50/40' : ''}`}>
                    <td className="p-3">
                      <div className="font-mono text-xs">{b.confirmationNumber}</div>
                      {b.sourceEnquiryId && <div className="text-xs text-blue-600 mt-0.5">↙ From Enquiry</div>}
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{b.guestName}</div>
                      <a href={buildWaLink(b.contactNumber, WA_TEMPLATES.enquiryGreeting(b.guestName))} target="_blank" rel="noopener noreferrer" className="text-xs text-stone-500 hover:text-green-700 flex items-center gap-1">
                        <MessageCircle size={11} /> {b.contactNumber}
                      </a>
                      {b.companyName && <div className="text-xs text-stone-500 italic">{b.companyName}</div>}
                    </td>
                    <td className="p-3 text-xs">
                      <div>{fmtDate(b.arrival)} → {fmtDate(b.departure)}</div>
                      <div className="text-stone-500">{b.nights}n · {b.rooms?.length} rooms · {b.adults}A/{b.children}C</div>
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 ${statusColor}`}>{statusLabel}</span>
                    </td>
                    {!isOp && <td className="p-3 text-right">₹{b.totalAmount.toLocaleString('en-IN')}</td>}
                    {!isOp && <td className={`p-3 text-right ${payColor}`}>₹{ps.totalPaid.toLocaleString('en-IN')}</td>}
                    {!isOp && <td className={`p-3 text-right ${payColor}`}>₹{ps.balance.toLocaleString('en-IN')}</td>}
                    <td className="p-3 text-xs text-stone-500">{b.createdBy}</td>
                    <td className="p-3 text-right">
                      <div className="flex gap-1 justify-end">
                        {(isSales || isFO || isAdmin) && (
                          <>
                            <button onClick={() => setEditBooking(b)} title="Edit" className="p-1.5 hover:bg-stone-100 text-stone-600 rounded"><Edit2 size={13} /></button>
                            <button onClick={() => setPaymentFor(b)} title="Payment" className="text-xs bg-emerald-700 text-white px-2 py-1 hover:bg-emerald-800">+PAY</button>
                          </>
                        )}
                        {(isFO || isAdmin) && (
                          <button onClick={() => setFinalBillFor(b)} title="Final Bill" className="text-xs bg-blue-700 text-white px-2 py-1 hover:bg-blue-800">BILL</button>
                        )}
                        {(isSales || isFO || isAdmin) && (
                          <button onClick={() => handlePrint(b)} title="Print Voucher" className="p-1.5 hover:bg-stone-100 text-stone-600 rounded"><FileText size={13} /></button>
                        )}
                        {isAdmin && (
                          <button onClick={() => handleDelete(b.id)} disabled={isPending} title="Delete" className="p-1.5 hover:bg-red-100 text-red-600 rounded disabled:opacity-50"><Trash2 size={13} /></button>
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
      {editBooking && <BookingModal booking={editBooking} users={users} currentUser={currentUser} existingBookings={bookings} onClose={() => setEditBooking(null)} />}
      {paymentFor && <PaymentModal booking={paymentFor} currentUser={currentUser} payments={payments.filter(p => p.bookingId === paymentFor.id)} onClose={() => setPaymentFor(null)} />}
      {finalBillFor && <FinalBillModal booking={finalBillFor} currentUser={currentUser} payments={payments.filter(p => p.bookingId === finalBillFor.id)} onClose={() => setFinalBillFor(null)} />}
    </div>
  );
}
