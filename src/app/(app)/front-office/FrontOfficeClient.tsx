'use client';

import { useState, useMemo, useTransition } from 'react';
import { LogIn, LogOut, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { checkInBooking, checkOutBooking } from '@/lib/actions/bookings';
import { fmtDate, todayISO } from '@/lib/utils/date';
import { getBookingPaymentStatus } from '@/lib/utils/booking';
import type { Booking } from '@/lib/types/booking';
import type { CheckInDetailsInput } from '@/lib/validations/booking';
import type { Payment } from '@/lib/types/payment';
import type { UserRole } from '@/lib/types/profile';
import dynamic from 'next/dynamic';

const PaymentModal = dynamic(() => import('@/components/payments/PaymentModal').then(m => ({ default: m.PaymentModal })), { ssr: false });
const FinalBillModal = dynamic(() => import('@/components/front-office/FinalBillModal').then(m => ({ default: m.FinalBillModal })), { ssr: false });
const CheckInModal = dynamic(() => import('@/components/front-office/CheckInModal').then(m => ({ default: m.CheckInModal })), { ssr: false });

interface Props {
  initialBookings: Booking[];
  initialPayments: Payment[];
  currentUser: { id: string; name: string; role: UserRole };
}

type SubTab = 'arrivals' | 'inhouse' | 'departures' | 'billstorecord' | 'checkedout';

export function FrontOfficeClient({ initialBookings, initialPayments, currentUser }: Props) {
  const today = todayISO();
  const [tab, setTab] = useState<SubTab>('arrivals');
  const [paymentFor, setPaymentFor] = useState<Booking | null>(null);
  const [finalBillFor, setFinalBillFor] = useState<Booking | null>(null);
  const [checkInFor, setCheckInFor] = useState<Booking | null>(null);
  const [checkOutFor, setCheckOutFor] = useState<Booking | null>(null);
  const [isPending, startTransition] = useTransition();
  const canAct = currentUser.role === 'Front Office' || currentUser.role === 'Admin';

  const bookings = initialBookings;
  const payments = initialPayments;
  const pStats = (b: Booking) => getBookingPaymentStatus(b, payments);

  // Status-driven (not date math): a guest is in-house only once Front Office has
  // actually checked them in.
  const arriving = useMemo(
    () => bookings.filter(b => b.status === 'confirmed' && b.arrival === today).sort((a, b) => a.guestName.localeCompare(b.guestName)),
    [bookings, today],
  );
  const inHouse = useMemo(
    () => bookings.filter(b => b.status === 'checked_in' && b.departure > today).sort((a, b) => a.guestName.localeCompare(b.guestName)),
    [bookings, today],
  );
  const departing = useMemo(
    () => bookings.filter(b => b.status === 'checked_in' && b.departure === today).sort((a, b) => a.guestName.localeCompare(b.guestName)),
    [bookings, today],
  );
  // Departed/at-checkout guests whose final bill hasn't been recorded yet.
  const billsToRecord = useMemo(
    () => bookings.filter(b => (b.status === 'checked_in' || b.status === 'checked_out') && b.departure <= today && !b.finalBill),
    [bookings, today],
  );
  const checkedOut = useMemo(
    () => bookings.filter(b => b.status === 'checked_out').sort((a, b) => (b.departure ?? '').localeCompare(a.departure ?? '')),
    [bookings],
  );

  const lists: Record<SubTab, { title: string; items: Booking[]; empty: string }> = {
    arrivals: { title: "Today's Arrivals", items: arriving, empty: 'No arrivals to check in' },
    inhouse: { title: 'In-House Guests', items: inHouse, empty: 'No guests in-house' },
    departures: { title: "Today's Departures", items: departing, empty: 'No departures today' },
    billstorecord: { title: 'Bills to Record', items: billsToRecord, empty: 'All bills recorded ✓' },
    checkedout: { title: 'Checked Out', items: checkedOut, empty: 'No checked-out guests yet' },
  };

  const activeList = lists[tab]!;

  // Front Office collects money only at checkout, so Pay/Bill appear once the guest
  // is at/after departure. Advances during the stay are taken by Sales (bookings tab).
  const atCheckout = (b: Booking) => b.departure <= today && (b.status === 'checked_in' || b.status === 'checked_out');

  const handleCheckIn = (details: CheckInDetailsInput) => {
    const target = checkInFor;
    if (!target) return;
    startTransition(async () => {
      const res = await checkInBooking(target.id, details);
      if (!res.success) { toast.error(res.error); return; }
      toast.success('Guest checked in — now In-House');
      setCheckInFor(null);
    });
  };

  const handleCheckOut = () => {
    const target = checkOutFor;
    if (!target) return;
    startTransition(async () => {
      const res = await checkOutBooking(target.id);
      if (!res.success) { toast.error(res.error); return; }
      toast.success('Guest checked out');
      setCheckOutFor(null);
    });
  };

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-stone-300">
        <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Front Office Operations</h2>
        <p className="text-sm text-stone-500 italic">Check in arrivals, manage in-house guests, settle at checkout</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-4 border-b border-stone-200 flex-wrap">
        {(Object.entries(lists) as [SubTab, typeof lists[SubTab]][]).map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm transition border-b-2 ${tab === k ? 'border-blue-600 text-blue-800 font-medium' : 'border-transparent text-stone-500 hover:text-stone-800'}`}>
            {v.title} {v.items.length > 0 && <span className="ml-1 text-xs bg-stone-200 px-1.5 py-0.5 rounded-full">{v.items.length}</span>}
          </button>
        ))}
      </div>

      <div className="bg-white border border-stone-200">
        {activeList.items.length === 0 ? (
          <div className="p-10 text-center text-stone-400 italic">{activeList.empty}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-stone-600">Guest</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-stone-600">Contact</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-stone-600">Rooms</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider text-stone-600">Stay</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider text-stone-600">Estimated</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider text-stone-600">Paid</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider text-stone-600">Balance</th>
                {canAct && <th className="text-right p-3 text-xs uppercase tracking-wider text-stone-600">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {activeList.items.map(b => {
                const ps = pStats(b);
                // 3-step checkout gate: bill must be added → then payment → then checkout.
                const hasBill = !!b.finalBill;
                const hasPayment = ps.totalPaid > 0;
                return (
                  <tr key={b.id} className="border-t border-stone-100 hover:bg-stone-50">
                    <td className="p-3">
                      <div className="font-medium">{b.guestName}</div>
                      {tab === 'departures' && (b.specialRequests || b.remarks) && (
                        <div className="mt-1 space-y-0.5">
                          {b.specialRequests && <div className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">⚑ {b.specialRequests}</div>}
                          {b.remarks && <div className="text-xs text-stone-500 italic">{b.remarks}</div>}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-xs text-stone-600">{b.contactNumber}</td>
                    <td className="p-3 text-xs">{b.rooms?.join(', ') || '—'}</td>
                    <td className="p-3 text-xs">{fmtDate(b.arrival)} → {fmtDate(b.departure)} ({b.nights}n)</td>
                    <td className="p-3 text-right text-xs">₹{b.totalAmount.toLocaleString('en-IN')}</td>
                    <td className="p-3 text-right text-xs text-emerald-700">₹{ps.totalPaid.toLocaleString('en-IN')}</td>
                    <td className={`p-3 text-right text-xs font-medium ${ps.balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>₹{Math.abs(ps.balance).toLocaleString('en-IN')}{ps.balance < 0 ? ' CR' : ''}</td>
                    {canAct && (
                      <td className="p-3 text-right">
                        <div className="flex gap-1 justify-end items-center">
                          {b.status === 'confirmed' && b.arrival <= today && (
                            <button onClick={() => setCheckInFor(b)} disabled={isPending} className="inline-flex items-center gap-1 text-xs bg-emerald-700 text-white px-2.5 py-1 hover:bg-emerald-800 disabled:opacity-50">
                              <LogIn size={12} /> CHECK IN
                            </button>
                          )}
                          {b.status === 'checked_in' && (
                            <button onClick={() => setCheckOutFor(b)} disabled={isPending || !hasPayment} title={hasPayment ? 'Check out guest' : 'Record a payment before checking out'} className="inline-flex items-center gap-1 text-xs border border-stone-300 text-stone-700 px-2.5 py-1 hover:bg-stone-100 disabled:opacity-50 disabled:cursor-not-allowed">
                              <LogOut size={12} /> CHECK OUT
                            </button>
                          )}
                          {atCheckout(b) && (
                            <>
                              <button onClick={() => setPaymentFor(b)} disabled={!hasBill} title={hasBill ? 'Record payment' : 'Add the bill before recording payment'} className="text-xs bg-emerald-700 text-white px-2.5 py-1 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed">+ PAY</button>
                              {hasBill ? (
                                <button onClick={() => setFinalBillFor(b)} title="Bill added — view or edit" className="inline-flex items-center gap-1 text-xs border border-emerald-600 text-emerald-700 px-2.5 py-1 hover:bg-emerald-50">
                                  <Check size={12} /> ADDED
                                </button>
                              ) : (
                                <button onClick={() => setFinalBillFor(b)} className="text-xs bg-blue-700 text-white px-2.5 py-1 hover:bg-blue-800">BILL</button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {paymentFor && <PaymentModal booking={paymentFor} currentUser={currentUser} payments={payments.filter(p => p.bookingId === paymentFor.id)} onClose={() => setPaymentFor(null)} />}
      {finalBillFor && <FinalBillModal booking={finalBillFor} currentUser={currentUser} payments={payments.filter(p => p.bookingId === finalBillFor.id)} onClose={() => setFinalBillFor(null)} />}
      {checkInFor && <CheckInModal booking={checkInFor} onConfirm={handleCheckIn} onClose={() => setCheckInFor(null)} isPending={isPending} />}

      {checkOutFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white max-w-sm w-full shadow-xl">
            <div className="px-6 py-4 border-b border-stone-200 flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-600" />
              <h3 className="text-lg text-stone-800" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Confirm Check-Out</h3>
            </div>
            <div className="px-6 py-4 text-sm text-stone-600">
              Check out <strong className="text-stone-900">{checkOutFor.guestName}</strong> ({checkOutFor.confirmationNumber})? This marks the stay complete and moves them to the Checked Out list.
            </div>
            <div className="px-6 py-4 bg-stone-50 border-t border-stone-200 flex justify-end gap-2">
              <button onClick={() => setCheckOutFor(null)} disabled={isPending} className="px-4 py-2 text-sm border border-stone-300 text-stone-600 hover:bg-stone-50 disabled:opacity-50">Cancel</button>
              <button onClick={handleCheckOut} disabled={isPending} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50">
                <LogOut size={14} /> {isPending ? 'CHECKING OUT…' : 'CONFIRM CHECK-OUT'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
