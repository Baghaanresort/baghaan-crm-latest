'use client';

import { useState, useTransition } from 'react';
import { X, CheckCircle2, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { addPayment } from '@/lib/actions/payments';
import { PAYMENT_MODES } from '@/lib/constants/payments';
import { fmtDate, todayISO } from '@/lib/utils/date';
import { fromPaise, formatINR } from '@/lib/utils/money';
import { DateInput } from '@/components/ui/DateInput';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import type { PaymentLink, OutboundMessage } from '@/lib/types/transactions';
import type { PaymentLinkStatus, OutboundStatus } from '@/lib/constants/transactions';

interface Props {
  booking: Booking;
  currentUser: { name: string; role: string };
  payments: Payment[];
  // Razorpay payment links + outbound delivery messages for this booking (read-only).
  // Optional: list surfaces that don't load them (e.g. Bookings) simply omit them.
  paymentLinks?: PaymentLink[];
  messages?: OutboundMessage[];
  onClose: () => void;
}

// Badge colours reuse the modal's existing emerald/amber/purple/red/stone palette.
const LINK_STATUS_STYLE: Record<PaymentLinkStatus, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  partially_paid: 'bg-amber-100 text-amber-700',
  sent: 'bg-blue-100 text-blue-700',
  created: 'bg-stone-100 text-stone-600',
  cancelled: 'bg-stone-200 text-stone-500',
  expired: 'bg-red-100 text-red-700',
};

const MSG_STATUS_STYLE: Record<OutboundStatus, string> = {
  delivered: 'bg-emerald-100 text-emerald-700',
  read: 'bg-emerald-100 text-emerald-700',
  sent: 'bg-blue-100 text-blue-700',
  queued: 'bg-stone-100 text-stone-600',
  failed: 'bg-red-100 text-red-700',
};

export function PaymentModal({ booking, currentUser, payments, paymentLinks = [], messages = [], onClose }: Props) {
  const today = todayISO();
  const [isPending, startTransition] = useTransition();
  // An enquiry-linked hold may have been blocked without a quote. The advance is a
  // slice of the package total, so capture (and require) the total here.
  const isEnquiryHold = !!booking.sourceEnquiryId && booking.status === 'hold';
  // Suggest the outstanding "advance to be paid" as the amount when one is set on the hold.
  const advancePrefill = Math.max(0, (booking.advanceRequired ?? 0) - payments.filter(p => p.type !== 'refund').reduce((s, p) => s + p.amount, 0));

  const [form, setForm] = useState({
    paymentDate: today,
    amount: advancePrefill > 0 ? String(advancePrefill) : '',
    totalAmount: booking.totalAmount ? String(booking.totalAmount) : '',
    mode: 'UPI',
    reference: '',
    type: booking.departure < today ? 'btc_receipt' : booking.arrival <= today ? 'balance' : 'advance',
    notes: '',
  });

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  // Verification removed: every recorded payment counts toward the balance.
  const totalPaid = payments.filter(p => p.type !== 'refund').reduce((s, p) => s + p.amount, 0);
  // For an enquiry hold the bill is the live total being typed, so balance / the
  // 50% & Full shortcuts stay correct as the total is entered.
  const billAmount = isEnquiryHold
    ? Number(form.totalAmount || 0)
    : (booking.finalBill?.totalAmount ?? booking.totalAmount);
  const balance = billAmount - totalPaid;

  const handleSubmit = () => {
    const amount = Number(form.amount);
    if (amount <= 0) { toast.error('Amount must be greater than 0'); return; }
    if (!form.paymentDate) { toast.error('Payment date is required'); return; }
    if (!form.mode) { toast.error('Mode of payment is required'); return; }
    const enquiryTotal = isEnquiryHold ? Number(form.totalAmount) : undefined;
    if (isEnquiryHold && (!form.totalAmount || Number.isNaN(enquiryTotal!) || enquiryTotal! <= 0)) {
      toast.error('Total package amount is required'); return;
    }

    startTransition(async () => {
      const result = await addPayment({
        bookingId: booking.id,
        paymentDate: form.paymentDate,
        amount,
        mode: form.mode,
        reference: form.reference.trim(),
        type: form.type as 'advance' | 'balance' | 'btc_receipt',
        notes: form.notes.trim(),
        ...(enquiryTotal !== undefined ? { totalAmount: enquiryTotal } : {}),
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success('Payment recorded');
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-stone-50 max-w-2xl w-full my-8">
        <div className="sticky top-0 bg-emerald-900 text-white px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">Record Payment</h2>
            <p className="text-xs text-stone-300 mt-0.5">{booking.confirmationNumber} · {booking.guestName}</p>
          </div>
          <button onClick={onClose} className="hover:bg-emerald-800 p-1.5 rounded"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Summary */}
          <div className="bg-stone-100 px-4 py-3 grid grid-cols-3 gap-4 text-sm">
            <div><div className="text-xs text-stone-500 uppercase tracking-wider">Bill Amount</div><div className="font-medium">₹{billAmount.toLocaleString('en-IN')}</div></div>
            <div><div className="text-xs text-stone-500 uppercase tracking-wider">Paid</div><div className="font-medium text-emerald-700">₹{totalPaid.toLocaleString('en-IN')}</div></div>
            <div><div className="text-xs text-stone-500 uppercase tracking-wider">Balance Due</div><div className={`font-medium ${balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>₹{Math.abs(balance).toLocaleString('en-IN')}{balance < 0 ? ' CR' : ''}</div></div>
          </div>

          {/* Enquiry holds may have been blocked without a quote — capture the package total here. */}
          {isEnquiryHold && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-3">
              <label className="text-xs text-stone-700 uppercase tracking-wider block mb-1 font-medium">Total Package Amount (₹) *</label>
              <input type="number" min="0" value={form.totalAmount} onChange={e => update('totalAmount', e.target.value)} placeholder="Enter the full package amount" className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-amber-600 bg-white" />
              <p className="text-xs text-stone-500 italic mt-1.5">Required to record an advance against a blocked hold. The advance below is part of this total.</p>
            </div>
          )}

          {/* Form */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Payment Date *</label>
              <DateInput value={form.paymentDate} onChange={v => update('paymentDate', v)} className="w-full" />
            </div>
            <div>
              <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Amount (₹) *</label>
              <input type="number" value={form.amount} onChange={e => update('amount', e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Payment Type *</label>
              <select value={form.type} onChange={e => update('type', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white">
                <option value="advance">Advance</option>
                <option value="balance">Balance</option>
                <option value="btc_receipt">BTC Receipt</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Mode of Payment *</label>
              <select value={form.mode} onChange={e => update('mode', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white">
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Reference / UTR / Cheque No.</label>
            <input value={form.reference} onChange={e => update('reference', e.target.value)} placeholder="UTR, transaction ID, cheque number, or last 4 digits of card" className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white" />
          </div>

          <div>
            <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Notes (optional)</label>
            <textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white" />
          </div>

          <div className="border-l-4 p-3 bg-emerald-50 border-emerald-500">
            <div className="text-xs flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-700" />
              <span className="text-emerald-900">This payment counts toward the balance immediately on recording.</span>
            </div>
          </div>

          {/* Existing payments */}
          {payments.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-stone-600 border-b border-stone-200 pb-1 mb-2">Payment History</h4>
              <table className="w-full text-xs">
                <thead><tr className="text-stone-500"><th className="text-left py-1">Date</th><th className="text-left py-1">Type</th><th className="text-left py-1">Mode</th><th className="text-left py-1">Reference</th><th className="text-right py-1">Amount</th><th className="text-right py-1">Status</th></tr></thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} className="border-t border-stone-100">
                      <td className="py-1.5">{fmtDate(p.paymentDate)}</td>
                      <td className="py-1.5 capitalize">{p.type?.replace('_', ' ')}</td>
                      <td className="py-1.5">{p.mode}</td>
                      <td className="py-1.5 text-stone-500">{p.reference || '—'}</td>
                      <td className="py-1.5 text-right font-medium">₹{p.amount.toLocaleString('en-IN')}</td>
                      <td className="py-1.5 text-right">{p.verified ? <span className="text-emerald-700">✓ Verified</span> : <span className="text-purple-700">⏳ Pending</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Payment links — what was sent and whether it was paid. Read-only. */}
          {paymentLinks.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-stone-600 border-b border-stone-200 pb-1 mb-2">Payment Links</h4>
              <table className="w-full text-xs">
                <thead><tr className="text-stone-500"><th className="text-left py-1">Purpose</th><th className="text-right py-1">Amount</th><th className="text-left py-1 pl-3">Status</th><th className="text-right py-1">Link</th></tr></thead>
                <tbody>
                  {paymentLinks.map(l => (
                    <tr key={l.id} className="border-t border-stone-100">
                      <td className="py-1.5 capitalize">{l.purpose.replace(/_/g, ' ')}</td>
                      <td className="py-1.5 text-right font-medium">{formatINR(fromPaise(l.amount))}</td>
                      <td className="py-1.5 pl-3"><span className={`px-1.5 py-0.5 capitalize ${LINK_STATUS_STYLE[l.status]}`}>{l.status.replace(/_/g, ' ')}</span></td>
                      <td className="py-1.5 text-right">
                        {l.shortUrl ? (
                          <span className="inline-flex items-center gap-1.5 justify-end">
                            <a href={l.shortUrl} target="_blank" rel="noopener noreferrer" title="Open payment link" className="p-1 hover:bg-stone-100 text-stone-600 rounded"><ExternalLink size={12} /></a>
                            <button type="button" onClick={() => { navigator.clipboard?.writeText(l.shortUrl!); toast.success('Link copied'); }} title="Copy payment link" className="p-1 hover:bg-stone-100 text-stone-600 rounded"><Copy size={12} /></button>
                          </span>
                        ) : <span className="text-stone-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Outbound messages — delivery status of WhatsApp/email notifications. Read-only. */}
          {messages.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-stone-600 border-b border-stone-200 pb-1 mb-2">Messages Sent</h4>
              <table className="w-full text-xs">
                <thead><tr className="text-stone-500"><th className="text-left py-1">Channel</th><th className="text-left py-1">Purpose</th><th className="text-left py-1">Status</th><th className="text-right py-1">Sent</th></tr></thead>
                <tbody>
                  {messages.map(m => (
                    <tr key={m.id} className="border-t border-stone-100">
                      <td className="py-1.5 capitalize">{m.channel}</td>
                      <td className="py-1.5 capitalize">{m.purpose.replace(/_/g, ' ')}</td>
                      <td className="py-1.5"><span className={`px-1.5 py-0.5 capitalize ${MSG_STATUS_STYLE[m.status]}`}>{m.status}</span></td>
                      <td className="py-1.5 text-right text-stone-500">{fmtDate(m.createdAt.slice(0, 10))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-stone-300">
            <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 transition tracking-wider">CANCEL</button>
            <button onClick={handleSubmit} disabled={isPending} className="px-6 py-2.5 text-sm bg-emerald-900 hover:bg-emerald-800 text-amber-100 transition tracking-wider disabled:opacity-50">
              {isPending ? 'SAVING…' : 'RECORD PAYMENT'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
