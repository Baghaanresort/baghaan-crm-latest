'use client';

import { useState, useMemo, useTransition } from 'react';
import { Trash2, Download, IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import { deletePayment, markRefundDone } from '@/lib/actions/payments';
import { getBookingPaymentStatus } from '@/lib/utils/booking';
import { fmtDate, todayISO, daysBetween } from '@/lib/utils/date';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import type { PaymentLink, OutboundMessage } from '@/lib/types/transactions';
import type { UserRole } from '@/lib/types/profile';
import dynamic from 'next/dynamic';

const PaymentModal = dynamic(() => import('@/components/payments/PaymentModal').then(m => ({ default: m.PaymentModal })), { ssr: false });

interface Props {
  initialBookings: Booking[];
  initialPayments: Payment[];
  initialPaymentLinks: PaymentLink[];
  initialMessages: OutboundMessage[];
  currentUser: { id: string; name: string; role: UserRole };
}

type SubTab = 'advances' | 'resort' | 'billed' | 'refund' | 'ledger' | 'btc';

export function AccountsClient({ initialBookings, initialPayments, initialPaymentLinks, initialMessages, currentUser }: Props) {
  const today = todayISO();
  const [tab, setTab] = useState<SubTab>('advances');
  const [isPending, startTransition] = useTransition();
  const [paymentFor, setPaymentFor] = useState<Booking | null>(null);
  const canManage = currentUser.role === 'Accounts' || currentUser.role === 'Admin';

  const bookings = initialBookings;
  const payments = initialPayments;

  const bookingMap = useMemo(() => new Map(bookings.map(b => [b.id, b])), [bookings]);
  const pStats = (b: Booking) => getBookingPaymentStatus(b, payments);

  // Advance payments (the deposit collected before the stay).
  const advances = useMemo(
    () => payments.filter(p => p.type === 'advance').sort((a, b) => (b.recordedAt ?? '').localeCompare(a.recordedAt ?? '')),
    [payments],
  );
  // Money collected at the resort by Front Office (cash/card/UPI at the desk).
  const resortPayments = useMemo(
    () => payments.filter(p => p.type !== 'refund' && p.recordedByRole === 'Front Office').sort((a, b) => (b.recordedAt ?? '').localeCompare(a.recordedAt ?? '')),
    [payments],
  );
  // Bookings that have a final bill recorded — the billed book.
  const billed = useMemo(
    () => bookings.filter(b => b.finalBill && Number(b.finalBill.totalAmount ?? 0) > 0).sort((a, b) => (b.finalBill?.billDate ?? '').localeCompare(a.finalBill?.billDate ?? '')),
    [bookings],
  );
  const btcOpen = useMemo(() => bookings.filter(b => b.finalBill?.isBTC && pStats(b).balance > 0), [bookings, payments]);
  const refunds = useMemo(() => payments.filter(p => p.type === 'refund').sort((a, b) => (b.recordedAt ?? '').localeCompare(a.recordedAt ?? '')), [payments]);
  const refundsPending = useMemo(() => refunds.filter(p => p.refundStatus !== 'done'), [refunds]);

  const sum = (rows: Payment[]) => rows.reduce((s, p) => s + p.amount, 0);

  const handleRefundDone = (id: string) => {
    startTransition(async () => {
      const result = await markRefundDone(id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Refund marked done');
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

  const conf = (id: string) => bookingMap.get(id)?.confirmationNumber ?? id;
  const guest = (id: string) => bookingMap.get(id)?.guestName ?? '—';

  return (
    <div>
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Accounts</h2>
          <p className="text-sm text-stone-500 italic">Advance payments, resort collections, billing & receivables</p>
        </div>
        <a href="/api/export/payments" className="bg-white border border-stone-300 text-stone-600 hover:bg-stone-50 px-3 py-2 text-sm flex items-center gap-1.5 transition">
          <Download size={14} /> Export CSV
        </a>
      </div>

      <div className="flex items-end gap-1 mb-4 border-b border-stone-200 flex-wrap">
        {([
          ['advances', `Advance Payments (${advances.length})`],
          ['resort', `Payments at the Resort (${resortPayments.length})`],
          ['billed', `Total Billed (${billed.length})`],
          ['refund', `Refunds (${refundsPending.length})`],
          ['ledger', 'Full Ledger'],
          ['btc', `BTC Receivables (${btcOpen.length})`],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm transition border-b-2 ${tab === k ? 'border-purple-700 text-purple-900 font-medium' : 'border-transparent text-stone-500 hover:text-stone-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Advance Payments */}
      {tab === 'advances' && (
        <PaymentTable rows={advances} totalLabel="Total advances" total={sum(advances)} conf={conf} guest={guest} bookingMap={bookingMap} />
      )}

      {/* Payments at the Resort */}
      {tab === 'resort' && (
        <PaymentTable rows={resortPayments} totalLabel="Total collected at resort" total={sum(resortPayments)} conf={conf} guest={guest} bookingMap={bookingMap} />
      )}

      {/* Total Billed */}
      {tab === 'billed' && (
        <div className="bg-white border border-stone-200 overflow-x-auto">
          {billed.length === 0 ? (
            <div className="p-10 text-center text-stone-400 italic">No final bills recorded yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-stone-800 text-stone-100">
                <tr>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Bill #</th>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Booking</th>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Company / Guest</th>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Bill Date</th>
                  <th className="text-right p-3 text-xs uppercase tracking-wider">Bill Amount</th>
                  <th className="text-right p-3 text-xs uppercase tracking-wider">Paid</th>
                  <th className="text-right p-3 text-xs uppercase tracking-wider">Balance</th>
                </tr>
              </thead>
              <tbody>
                {billed.map(b => {
                  const ps = pStats(b);
                  return (
                    <tr key={b.id} className="border-t border-stone-100 hover:bg-stone-50">
                      <td className="p-3 font-mono text-xs">{b.finalBill?.billNumber ?? '—'}</td>
                      <td className="p-3 font-mono text-xs">{b.confirmationNumber}</td>
                      <td className="p-3"><div className="font-medium">{b.companyName || b.guestName}</div>{b.companyName && <div className="text-xs text-stone-500">{b.guestName}</div>}</td>
                      <td className="p-3 text-xs">{b.finalBill?.billDate ? fmtDate(b.finalBill.billDate) : '—'}</td>
                      <td className="p-3 text-right font-medium">₹{Number(b.finalBill?.totalAmount ?? 0).toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-emerald-700">₹{ps.totalPaid.toLocaleString('en-IN')}</td>
                      <td className={`p-3 text-right font-medium ${ps.balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>₹{ps.balance.toLocaleString('en-IN')}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-stone-300 bg-stone-50 font-medium">
                  <td className="p-3 text-xs uppercase tracking-wider text-stone-500" colSpan={4}>Total billed</td>
                  <td className="p-3 text-right">₹{billed.reduce((s, b) => s + Number(b.finalBill?.totalAmount ?? 0), 0).toLocaleString('en-IN')}</td>
                  <td className="p-3 text-right text-emerald-700">₹{billed.reduce((s, b) => s + pStats(b).totalPaid, 0).toLocaleString('en-IN')}</td>
                  <td className="p-3 text-right text-red-700">₹{billed.reduce((s, b) => s + Math.max(0, pStats(b).balance), 0).toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Refunds */}
      {tab === 'refund' && (
        <div className="bg-white border border-stone-200">
          {refunds.length === 0 ? (
            <div className="p-10 text-center text-stone-400 italic">No refunds to process ✓</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-purple-900 text-purple-100">
                <tr>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Booking</th>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Guest</th>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Mode</th>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Reference</th>
                  <th className="text-left p-3 text-xs uppercase tracking-wider">Initiated By</th>
                  <th className="text-right p-3 text-xs uppercase tracking-wider">Amount</th>
                  <th className="text-right p-3 text-xs uppercase tracking-wider">Status</th>
                  {canManage && <th className="text-right p-3 text-xs uppercase tracking-wider">Action</th>}
                </tr>
              </thead>
              <tbody>
                {refunds.map(p => {
                  const b = bookingMap.get(p.bookingId);
                  const done = p.refundStatus === 'done';
                  return (
                    <tr key={p.id} className={`border-t border-stone-100 hover:bg-purple-50/30 ${done ? 'opacity-60' : ''}`}>
                      <td className="p-3 font-mono text-xs">{b?.confirmationNumber ?? p.bookingId}</td>
                      <td className="p-3"><div className="font-medium">{b?.guestName ?? '—'}</div>{b?.companyName && <div className="text-xs text-stone-500">{b.companyName}</div>}</td>
                      <td className="p-3 text-xs">{fmtDate(p.paymentDate)}</td>
                      <td className="p-3 text-xs">{p.mode}</td>
                      <td className="p-3 text-xs text-stone-500">{p.reference || '—'}</td>
                      <td className="p-3 text-xs text-stone-500">{p.recordedBy}</td>
                      <td className="p-3 text-right font-medium text-purple-800">₹{p.amount.toLocaleString('en-IN')}</td>
                      <td className="p-3 text-right text-xs">{done ? <span className="text-emerald-700 font-medium">✓ Refund Done</span> : <span className="text-amber-700">⏳ Pending</span>}</td>
                      {canManage && (
                        <td className="p-3 text-right">
                          {!done && (
                            <button onClick={() => handleRefundDone(p.id)} disabled={isPending} className="inline-flex items-center gap-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-medium px-3 py-1.5 tracking-wider transition disabled:opacity-50">
                              <IndianRupee size={13} /> MARK DONE
                            </button>
                          )}
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
                {canManage && <th className="text-right p-3 text-xs uppercase tracking-wider">Action</th>}
              </tr>
            </thead>
            <tbody>
              {payments.map(p => {
                const b = bookingMap.get(p.bookingId);
                return (
                  <tr key={p.id} className="border-t border-stone-100 hover:bg-stone-50">
                    <td className="p-3 text-xs">{fmtDate(p.paymentDate)}</td>
                    <td className="p-3 font-mono text-xs">{b?.confirmationNumber ?? '—'}</td>
                    <td className="p-3 text-xs">{b?.guestName ?? '—'}</td>
                    <td className="p-3 text-xs capitalize">{p.type?.replace('_', ' ')}</td>
                    <td className="p-3 text-xs">{p.mode}</td>
                    <td className="p-3 text-xs text-stone-500">{p.reference || '—'}</td>
                    <td className="p-3 text-xs text-stone-500">{p.recordedBy}</td>
                    <td className={`p-3 text-right font-medium ${p.type === 'refund' ? 'text-purple-800' : ''}`}>{p.type === 'refund' ? '−' : ''}₹{p.amount.toLocaleString('en-IN')}</td>
                    {canManage && (
                      <td className="p-3 text-right">
                        <button onClick={() => handleDelete(p.id)} disabled={isPending} title="Delete" className="p-1.5 hover:bg-red-100 text-red-600 rounded disabled:opacity-50"><Trash2 size={13} /></button>
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
                      <td className="p-3"><div className="font-medium">{b.companyName || b.guestName}</div>{b.companyName && <div className="text-xs text-stone-500">{b.guestName}</div>}</td>
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

      {paymentFor && (
        <PaymentModal
          booking={paymentFor}
          currentUser={currentUser}
          payments={payments.filter(p => p.bookingId === paymentFor.id)}
          paymentLinks={initialPaymentLinks.filter(l => l.bookingId === paymentFor.id)}
          messages={initialMessages.filter(m => m.bookingId === paymentFor.id)}
          onClose={() => setPaymentFor(null)}
        />
      )}
    </div>
  );
}

// Shared incoming-payment table for the Advance Payments and Payments-at-the-Resort sections.
function PaymentTable({ rows, total, totalLabel, conf, guest, bookingMap }: {
  rows: Payment[]; total: number; totalLabel: string;
  conf: (id: string) => string; guest: (id: string) => string; bookingMap: Map<string, Booking>;
}) {
  return (
    <div className="bg-white border border-stone-200 overflow-x-auto">
      {rows.length === 0 ? (
        <div className="p-10 text-center text-stone-400 italic">Nothing here yet</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-stone-800 text-stone-100">
            <tr>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Date</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Booking</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Guest</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Mode</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Reference</th>
              <th className="text-left p-3 text-xs uppercase tracking-wider">Logged By</th>
              <th className="text-right p-3 text-xs uppercase tracking-wider">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const b = bookingMap.get(p.bookingId);
              return (
                <tr key={p.id} className="border-t border-stone-100 hover:bg-stone-50">
                  <td className="p-3 text-xs">{fmtDate(p.paymentDate)}</td>
                  <td className="p-3 font-mono text-xs">{conf(p.bookingId)}</td>
                  <td className="p-3"><div className="font-medium">{guest(p.bookingId)}</div>{b?.companyName && <div className="text-xs text-stone-500">{b.companyName}</div>}</td>
                  <td className="p-3 text-xs">{p.mode}</td>
                  <td className="p-3 text-xs text-stone-500">{p.reference || '—'}</td>
                  <td className="p-3 text-xs text-stone-500">{p.recordedBy}</td>
                  <td className="p-3 text-right font-medium">₹{p.amount.toLocaleString('en-IN')}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-stone-300 bg-stone-50 font-medium">
              <td className="p-3 text-xs uppercase tracking-wider text-stone-500" colSpan={6}>{totalLabel}</td>
              <td className="p-3 text-right text-emerald-800">₹{total.toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
