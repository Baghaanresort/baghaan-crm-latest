'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { setFinalBill, clearFinalBill } from '@/lib/actions/bookings';
import { addPayment } from '@/lib/actions/payments';
import { PAYMENT_MODES } from '@/lib/constants/payments';
import { fmtDate, todayISO } from '@/lib/utils/date';
import { getBookingPaymentStatus } from '@/lib/utils/booking';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';

interface Props {
  booking: Booking;
  currentUser: { name: string; role: string };
  payments: Payment[];
  onClose: () => void;
}

export function FinalBillModal({ booking, currentUser, payments, onClose }: Props) {
  const today = todayISO();
  const [isPending, startTransition] = useTransition();
  const ps = getBookingPaymentStatus(booking, payments);

  const [form, setForm] = useState({
    billNumber: booking.finalBill?.billNumber ?? '',
    totalAmount: booking.finalBill?.totalAmount ?? booking.totalAmount,
    billDate: booking.finalBill?.billDate ?? today,
    isBTC: booking.finalBill?.isBTC ?? false,
    notes: booking.finalBill?.notes ?? '',
  });

  const [payForm, setPayForm] = useState({
    show: false,
    paymentDate: today,
    amount: Math.max(0, ps.balance),
    mode: 'Cash',
    reference: '',
    notes: '',
  });

  const handleSave = () => {
    if (!form.billNumber.trim()) { toast.error('Bill number is required'); return; }
    if (form.totalAmount <= 0) { toast.error('Bill amount must be greater than 0'); return; }

    startTransition(async () => {
      const result = await setFinalBill({
        bookingId: booking.id,
        billNumber: form.billNumber,
        totalAmount: form.totalAmount,
        billDate: form.billDate,
        isBTC: form.isBTC,
        notes: form.notes,
      });
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Final bill recorded');
      onClose();
    });
  };

  const handleClear = () => {
    if (!confirm('Remove the final bill from this booking? Payment records will remain.')) return;
    startTransition(async () => {
      const result = await clearFinalBill(booking.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Final bill removed');
      onClose();
    });
  };

  const handleAddPayment = () => {
    if (payForm.amount <= 0) { toast.error('Amount required'); return; }
    startTransition(async () => {
      const result = await addPayment({
        bookingId: booking.id,
        paymentDate: payForm.paymentDate,
        amount: payForm.amount,
        mode: payForm.mode,
        reference: payForm.reference,
        type: 'balance',
        notes: payForm.notes,
      });
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Payment recorded');
      setPayForm(f => ({ ...f, show: false }));
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" style={{ fontFamily: "'Lora', Georgia, serif" }}>
      <div className="bg-stone-50 max-w-2xl w-full my-8">
        <div className="sticky top-0 bg-blue-700 text-white px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">Final Bill</h2>
            <p className="text-xs text-blue-100 mt-0.5">{booking.confirmationNumber} · {booking.guestName}</p>
          </div>
          <button onClick={onClose} className="hover:bg-blue-800 p-1.5 rounded"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Payment summary */}
          <div className="bg-stone-100 px-4 py-3 grid grid-cols-3 gap-4 text-sm">
            <div><div className="text-xs text-stone-500 uppercase">Estimated</div><div className="font-medium">₹{booking.totalAmount.toLocaleString('en-IN')}</div></div>
            <div><div className="text-xs text-stone-500 uppercase">Verified Paid</div><div className="font-medium text-emerald-700">₹{ps.totalPaid.toLocaleString('en-IN')}</div></div>
            <div><div className="text-xs text-stone-500 uppercase">Balance Due</div><div className={`font-medium ${ps.balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>₹{Math.abs(ps.balance).toLocaleString('en-IN')}{ps.balance < 0 ? ' CR' : ''}</div></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Bill Number *</label><input value={form.billNumber} onChange={e => setForm(f => ({ ...f, billNumber: e.target.value }))} placeholder="From your invoicing software" className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Bill Amount (₹) *</label><input type="number" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: Number(e.target.value) }))} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Bill Date *</label><input type="date" value={form.billDate} onChange={e => setForm(f => ({ ...f, billDate: e.target.value }))} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>
            <div className="flex items-end pb-2"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.isBTC} onChange={e => setForm(f => ({ ...f, isBTC: e.target.checked }))} /><span className="text-sm">Bill to Company (BTC)</span></label></div>
          </div>

          <div><label className="text-xs text-stone-600 uppercase tracking-wider block mb-1">Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-stone-300 text-sm outline-none bg-white" /></div>

          {/* Payment history */}
          {payments.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-stone-600 border-b border-stone-200 pb-1 mb-2">Payments Recorded</h4>
              <table className="w-full text-xs">
                <thead><tr className="text-stone-500"><th className="text-left py-1">Date</th><th className="text-left py-1">Mode</th><th className="text-right py-1">Amount</th><th className="text-right py-1">Status</th></tr></thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} className="border-t border-stone-100">
                      <td className="py-1">{fmtDate(p.paymentDate)}</td>
                      <td className="py-1">{p.mode}</td>
                      <td className="py-1 text-right">₹{p.amount.toLocaleString('en-IN')}</td>
                      <td className="py-1 text-right">{p.verified ? <span className="text-emerald-700">✓</span> : <span className="text-purple-700">⏳</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Quick payment addition */}
          {payForm.show ? (
            <div className="bg-blue-50 border border-blue-200 p-4 space-y-3">
              <h4 className="text-xs uppercase tracking-wider text-blue-900 font-medium">Record Additional Payment</h4>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-stone-600 block mb-1">Date</label><input type="date" value={payForm.paymentDate} onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))} className="w-full px-2 py-1.5 border border-stone-300 text-sm bg-white" /></div>
                <div><label className="text-xs text-stone-600 block mb-1">Amount (₹)</label><input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: Number(e.target.value) }))} className="w-full px-2 py-1.5 border border-stone-300 text-sm bg-white" /></div>
                <div><label className="text-xs text-stone-600 block mb-1">Mode</label><select value={payForm.mode} onChange={e => setPayForm(f => ({ ...f, mode: e.target.value }))} className="w-full px-2 py-1.5 border border-stone-300 text-sm bg-white">{PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddPayment} disabled={isPending} className="text-xs bg-blue-700 text-white px-4 py-1.5 hover:bg-blue-800 disabled:opacity-50">RECORD</button>
                <button onClick={() => setPayForm(f => ({ ...f, show: false }))} className="text-xs border border-stone-300 px-3 py-1.5 hover:bg-stone-100">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setPayForm(f => ({ ...f, show: true }))} className="text-xs text-blue-700 hover:underline">+ Record additional payment</button>
          )}

          <div className="flex justify-between pt-4 border-t border-stone-300">
            <div>
              {booking.finalBill && (
                <button onClick={handleClear} disabled={isPending} className="text-xs text-red-700 hover:underline disabled:opacity-50">Remove final bill</button>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 transition tracking-wider">CANCEL</button>
              <button onClick={handleSave} disabled={isPending} className="px-6 py-2.5 text-sm bg-blue-700 hover:bg-blue-800 text-white transition tracking-wider disabled:opacity-50">
                {isPending ? 'SAVING…' : booking.finalBill ? 'UPDATE BILL' : 'RECORD BILL'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
