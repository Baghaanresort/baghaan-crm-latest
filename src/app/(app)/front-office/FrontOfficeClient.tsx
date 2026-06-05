'use client';

import { useState, useMemo } from 'react';
import { fmtDate, todayISO } from '@/lib/utils/date';
import { getBookingPaymentStatus } from '@/lib/utils/booking';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import type { UserRole } from '@/lib/types/profile';
import dynamic from 'next/dynamic';

const PaymentModal = dynamic(() => import('@/components/payments/PaymentModal').then(m => ({ default: m.PaymentModal })), { ssr: false });
const FinalBillModal = dynamic(() => import('@/components/front-office/FinalBillModal').then(m => ({ default: m.FinalBillModal })), { ssr: false });

interface Props {
  initialBookings: Booking[];
  initialPayments: Payment[];
  currentUser: { id: string; name: string; role: UserRole };
}

type SubTab = 'inhouse' | 'arrivals' | 'departures' | 'billstorecord';

export function FrontOfficeClient({ initialBookings, initialPayments, currentUser }: Props) {
  const today = todayISO();
  const [tab, setTab] = useState<SubTab>('inhouse');
  const [paymentFor, setPaymentFor] = useState<Booking | null>(null);
  const [finalBillFor, setFinalBillFor] = useState<Booking | null>(null);
  const canAct = currentUser.role === 'Front Office' || currentUser.role === 'Admin';

  const bookings = initialBookings;
  const payments = initialPayments;
  const pStats = (b: Booking) => getBookingPaymentStatus(b, payments);

  const inHouse = useMemo(() => bookings.filter(b => b.arrival <= today && b.departure > today), [bookings, today]);
  const arriving = useMemo(() => bookings.filter(b => b.arrival === today).sort((a, b) => a.guestName.localeCompare(b.guestName)), [bookings, today]);
  const departing = useMemo(() => bookings.filter(b => b.departure === today).sort((a, b) => a.guestName.localeCompare(b.guestName)), [bookings, today]);
  const billsToRecord = useMemo(() => bookings.filter(b => b.arrival <= today && b.departure >= today && !b.finalBill), [bookings, today]);

  const lists: Record<SubTab, { title: string; items: Booking[]; empty: string }> = {
    inhouse: { title: 'In-House Guests', items: inHouse, empty: 'No guests in-house' },
    arrivals: { title: "Today's Arrivals", items: arriving, empty: 'No arrivals today' },
    departures: { title: "Today's Departures", items: departing, empty: 'No departures today' },
    billstorecord: { title: 'Bills to Record', items: billsToRecord, empty: 'All bills recorded ✓' },
  };

  const activeList = lists[tab]!;

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-stone-300">
        <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Front Office Operations</h2>
        <p className="text-sm text-stone-500 italic">Today's check-ins, in-house guests, and folios</p>
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
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setPaymentFor(b)} className="text-xs bg-emerald-700 text-white px-2.5 py-1 hover:bg-emerald-800">+ PAY</button>
                          <button onClick={() => setFinalBillFor(b)} className="text-xs bg-blue-700 text-white px-2.5 py-1 hover:bg-blue-800">BILL</button>
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
    </div>
  );
}
