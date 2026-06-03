'use client';

import { useState, useTransition } from 'react';
import { X, CheckCircle2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { addPayment } from '@/lib/actions/payments';
import { PAYMENT_MODES, FO_AUTO_VERIFY_MODES } from '@/lib/constants/payments';
import { fmtDate, todayISO } from '@/lib/utils/date';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';

interface Props {
  booking: Booking;
  currentUser: { name: string; role: string };
  payments: Payment[];
  onClose: () => void;
}

export function PaymentModal({ booking, currentUser, payments, onClose }: Props) {
  const today = todayISO();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    paymentDate: today,
    amount: '',
    mode: 'UPI',
    reference: '',
    type: booking.departure < today ? 'btc_receipt' : booking.arrival <= today ? 'balance' : 'advance',
    notes: '',
  });

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const isAutoVerified = currentUser.role === 'Front Office' && FO_AUTO_VERIFY_MODES.has(form.mode);

  const totalPaid = payments.filter(p => p.verified).reduce((s, p) => s + p.amount, 0);
  const totalUnverified = payments.filter(p => !p.verified).reduce((s, p) => s + p.amount, 0);
  const billAmount = booking.finalBill?.totalAmount ?? booking.totalAmount;
  const balance = billAmount - totalPaid;

  const handleSubmit = () => {
    const amount = Number(form.amount);
    if (amount <= 0) { toast.error('Amount must be greater than 0'); return; }
    if (!form.paymentDate) { toast.error('Payment date is required'); return; }
    if (!form.mode) { toast.error('Mode of payment is required'); return; }

    startTransition(async () => {
      const result = await addPayment({
        bookingId: booking.id,
        paymentDate: form.paymentDate,
        amount,
        mode: form.mode,
        reference: form.reference.trim(),
        type: form.type as 'advance' | 'balance' | 'btc_receipt',
        notes: form.notes.trim(),
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(`Payment recorded${isAutoVerified ? ' & auto-verified' : ' — pending verification'}`);
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" style={{ fontFamily: "'Lora', Georgia, serif" }}>
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
            <div><div className="text-xs text-stone-500 uppercase tracking-wider">Verified Paid</div><div className="font-medium text-emerald-700">₹{totalPaid.toLocaleString('en-IN')}</div></div>
            <div><div className="text-xs text-stone-500 uppercase tracking-wider">Balance Due</div><div className={`font-medium ${balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>₹{Math.abs(balance).toLocaleString('en-IN')}{balance < 0 ? ' CR' : ''}</div></div>
          </div>

          {totalUnverified > 0 && (
            <div className="bg-purple-50 border border-purple-200 px-3 py-2 text-xs text-purple-800">
              ₹{totalUnverified.toLocaleString('en-IN')} pending verification — not counted in balance above
            </div>
          )}

          {/* Form */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Payment Date *</label>
              <input type="date" value={form.paymentDate} onChange={e => update('paymentDate', e.target.value)} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white" />
            </div>
            <div>
              <label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Amount (₹) *</label>
              <div className="flex gap-2">
                <input type="number" value={form.amount} onChange={e => update('amount', e.target.value)} placeholder="0" className="flex-1 px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white" />
                <button type="button" onClick={() => update('amount', String(Math.round(balance / 2)))} className="text-xs px-2 border border-stone-300 text-stone-600 hover:bg-stone-100 whitespace-nowrap">50%</button>
                <button type="button" onClick={() => update('amount', String(Math.max(0, balance)))} className="text-xs px-2 border border-stone-300 text-stone-600 hover:bg-stone-100">Full</button>
              </div>
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

          <div className={`border-l-4 p-3 ${isAutoVerified ? 'bg-emerald-50 border-emerald-500' : 'bg-purple-50 border-purple-500'}`}>
            <div className="text-xs flex items-center gap-2">
              {isAutoVerified ? (
                <><CheckCircle2 size={14} className="text-emerald-700" /><span className="text-emerald-900"><strong>Auto-verified:</strong> {form.mode} collected at front office is treated as immediately verified.</span></>
              ) : (
                <><ShieldCheck size={14} className="text-purple-700" /><span className="text-purple-900"><strong>Pending verification:</strong> Accounts will reconcile against the bank statement before this payment counts towards balance due.</span></>
              )}
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

          <div className="flex justify-end gap-3 pt-4 border-t border-stone-300">
            <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 transition tracking-wider">CANCEL</button>
            <button onClick={handleSubmit} disabled={isPending} className="px-6 py-2.5 text-sm bg-emerald-900 hover:bg-emerald-800 text-amber-100 transition tracking-wider disabled:opacity-50">
              {isPending ? 'SAVING…' : isAutoVerified ? 'RECORD & VERIFY' : 'RECORD PAYMENT'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
