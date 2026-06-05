'use client';

import { useState, useMemo, useTransition } from 'react';
import { CheckCircle2, XCircle, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { verifyPayment, unverifyPayment, deletePayment } from '@/lib/actions/payments';
import { getBookingPaymentStatus } from '@/lib/utils/booking';
import { fmtDate, todayISO, daysBetween } from '@/lib/utils/date';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import type { UserRole } from '@/lib/types/profile';
import dynamic from 'next/dynamic';

const PaymentModal = dynamic(() => import('@/components/payments/PaymentModal').then(m => ({ default: m.PaymentModal })), { ssr: false });

interface Props {
  initialBookings: Booking[];
  initialPayments: Payment[];
  currentUser: { id: string; name: string; role: UserRole };
}

type SubTab = 'verify' | 'ledger' | 'btc';

export function AccountsClient({ initialBookings, initialPayments, currentUser }: Props) {
  const today = todayISO();
  const [tab, setTab] = useState<SubTab>('verify');
  const [isPending, startTransition] = useTransition();
  const [paymentFor, setPaymentFor] = useState<Booking | null>(null);
  const canVerify = currentUser.role === 'Accounts' || currentUser.role === 'Admin';
  const canDelete = currentUser.role === 'Accounts' || currentUser.role === 'Admin';

  const bookings = initialBookings;
  const payments = initialPayments;

  const bookingMap = useMemo(() => new Map(bookings.map(b => [b.id, b])), [bookings]);
  const pStats = (b: Booking) => getBookingPaymentStatus(b, payments);

  const unverified = useMemo(() => payments.filter(p => !p.verified).sort((a, b) => (a.recordedAt ?? '').localeCompare(b.recordedAt ?? '')), [payments]);
  const btcOpen = useMemo(() => bookings.filter(b => b.finalBill?.isBTC && pStats(b).balance > 0), [bookings, payments]);

  const handleVerify = (id: string) => {
    startTransition(async () => {
      const result = await verifyPayment(id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Payment verified');
    });
  };

  const handleUnverify = (id: string) => {
    startTransition(async () => {
      const result = await unverifyPayment(id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Payment un-verified');
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this payment? Cannot be undone.')) return;
    startTransition(async () => {
      const result = await deletePayment(id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Payment deleted');
    });
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Accounts</h2>
          <p className="text-sm text-stone-500 italic">Payment verification, full ledger, and BTC receivables</p>
        </div>
        <a href="/api/export/payments" className="bg-white border border-stone-300 text-stone-600 hover:bg-stone-50 px-3 py-2 text-sm flex items-center gap-1.5 transition">
          <Download size={14} /> Export CSV
        </a>
      </div>

      <div className="flex gap-1 mb-4 border-b border-stone-200">
        {([['verify', `Pending Verification (${unverified.length})`], ['ledger', 'Full Ledger'], ['btc', `BTC Receivables (${btcOpen.length})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm transition border-b-2 ${tab === k ? 'border-purple-700 text-purple-900 font-medium' : 'border-transparent text-stone-500 hover:text-stone-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Pending Verification */}
      {tab === 'verify' && (
        <div className="bg-white border border-stone-200">
          {unverified.length === 0 ? (
            <div className="p-10 text-center text-stone-400 italic">No payments pending verification ✓</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-purple-900 text-purple-100">
                <tr>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Booking</th>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Guest</th>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Mode</th>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Reference</th>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Logged By</th>
                  <th className="text-right p-3 text-xs uppercase tracking-wider">Amount</th>
                  {canVerify && <th className="text-right p-3 text-xs uppercase tracking-wider">Action</th>}
                </tr>
              </thead>
              <tbody>
                {unverified.map(p => {
                  const b = bookingMap.get(p.bookingId);
                  return (
                    <tr key={p.id} className="border-t border-stone-100 hover:bg-purple-50/30">
                      <td className="p-3 font-mono text-xs">{b?.confirmationNumber ?? p.bookingId}</td>
                      <td className="p-3">
                        <div className="font-medium">{b?.guestName ?? '—'}</div>
                        {b && <div className="text-xs text-stone-500">{fmtDate(b.arrival)} ({b.nights}n)</div>}
                      </td>
                      <td className="p-3 text-xs">{fmtDate(p.paymentDate)}</td>
                      <td className="p-3 text-xs">{p.mode}</td>
                      <td className="p-3 text-xs text-stone-500">{p.reference || '—'}</td>
                      <td className="p-3 text-xs text-stone-500">{p.recordedBy}</td>
                      <td className="p-3 text-right font-medium">₹{p.amount.toLocaleString('en-IN')}</td>
                      {canVerify && (
                        <td className="p-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => handleVerify(p.id)} disabled={isPending} title="Verify" className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded disabled:opacity-50"><CheckCircle2 size={14} /></button>
                            {canDelete && <button onClick={() => handleDelete(p.id)} disabled={isPending} title="Delete" className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded disabled:opacity-50"><Trash2 size={14} /></button>}
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
      )}

      {/* Full Ledger */}
      {tab === 'ledger' && (
        <div className="bg-white border border-stone-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-800 text-stone-100">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Booking</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Guest</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Type</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Mode</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Reference</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Logged By</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Amount</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Status</th>
                {canVerify && <th className="text-right p-3 text-xs uppercase tracking-wider">Action</th>}
              </tr>
            </thead>
            <tbody>
              {payments.map(p => {
                const b = bookingMap.get(p.bookingId);
                return (
                  <tr key={p.id} className={`border-t border-stone-100 hover:bg-stone-50 ${!p.verified ? 'bg-purple-50/20' : ''}`}>
                    <td className="p-3 text-xs">{fmtDate(p.paymentDate)}</td>
                    <td className="p-3 font-mono text-xs">{b?.confirmationNumber ?? '—'}</td>
                    <td className="p-3 text-xs">{b?.guestName ?? '—'}</td>
                    <td className="p-3 text-xs capitalize">{p.type?.replace('_', ' ')}</td>
                    <td className="p-3 text-xs">{p.mode}</td>
                    <td className="p-3 text-xs text-stone-500">{p.reference || '—'}</td>
                    <td className="p-3 text-xs text-stone-500">{p.recordedBy}</td>
                    <td className="p-3 text-right font-medium">₹{p.amount.toLocaleString('en-IN')}</td>
                    <td className="p-3 text-right text-xs">
                      {p.verified ? (
                        <div>
                          <span className="text-emerald-700 font-medium">✓ Verified</span>
                          {p.verifiedBy && <div className="text-stone-400 text-xs mt-0.5">by {p.verifiedBy}{p.verifiedAt ? ` · ${fmtDate(p.verifiedAt.slice(0, 10))}` : ''}</div>}
                        </div>
                      ) : <span className="text-purple-700">⏳ Pending</span>}
                    </td>
                    {canVerify && (
                      <td className="p-3 text-right">
                        <div className="flex gap-1 justify-end">
                          {p.verified ? (
                            <button onClick={() => handleUnverify(p.id)} disabled={isPending} title="Un-verify" className="p-1.5 hover:bg-amber-100 text-amber-700 rounded disabled:opacity-50"><XCircle size={13} /></button>
                          ) : (
                            <button onClick={() => handleVerify(p.id)} disabled={isPending} title="Verify" className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded disabled:opacity-50"><CheckCircle2 size={13} /></button>
                          )}
                          {canDelete && <button onClick={() => handleDelete(p.id)} disabled={isPending} title="Delete" className="p-1.5 hover:bg-red-100 text-red-600 rounded disabled:opacity-50"><Trash2 size={13} /></button>}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* BTC Receivables */}
      {tab === 'btc' && (
        <div className="bg-white border border-stone-200">
          {btcOpen.length === 0 ? (
            <div className="p-10 text-center text-stone-400 italic">No outstanding BTC receivables ✓</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-purple-900 text-purple-100">
                <tr>
                  <th className="text-left p-3 text-xs uppercase">Bill #</th>
                  <th className="text-left p-3 text-xs uppercase">Company / Guest</th>
                  <th className="text-left p-3 text-xs uppercase">Checkout</th>
                  <th className="text-left p-3 text-xs uppercase">Days Outstanding</th>
                  <th className="text-right p-3 text-xs uppercase">Bill Amount</th>
                  <th className="text-right p-3 text-xs uppercase">Paid</th>
                  <th className="text-right p-3 text-xs uppercase">Outstanding</th>
                  <th className="text-right p-3 text-xs uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {btcOpen.map(b => {
                  const daysOut = daysBetween(b.departure, today);
                  const ps = pStats(b);
                  return (
                    <tr key={b.id} className="border-t border-stone-100">
                      <td className="p-3 font-mono text-xs">{b.finalBill?.billNumber ?? '—'}</td>
                      <td className="p-3">
                        <div className="font-medium">{b.companyName || b.guestName}</div>
                        {b.companyName && <div className="text-xs text-stone-500">{b.guestName}</div>}
                      </td>
                      <td className="p-3 text-xs">{fmtDate(b.departure)}</td>
                      <td className={`p-3 text-xs font-medium ${daysOut > 30 ? 'text-red-700' : daysOut > 15 ? 'text-amber-700' : 'text-stone-600'}`}>{daysOut}d</td>
                      <td className="p-3 text-right">₹{Number(b.finalBill?.totalAmount ?? 0).toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-emerald-700">₹{ps.totalPaid.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right font-medium text-red-700">₹{ps.balance.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right">
                        <button onClick={() => setPaymentFor(b)} className="text-xs bg-purple-700 text-white px-3 py-1 hover:bg-purple-800">+ RECEIPT</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {paymentFor && <PaymentModal booking={paymentFor} currentUser={currentUser} payments={payments.filter(p => p.bookingId === paymentFor.id)} onClose={() => setPaymentFor(null)} />}
    </div>
  );
}
