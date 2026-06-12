'use client';

import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { requestCancellation, requestPostponement } from '@/lib/actions/requests';
import { initiateRefund } from '@/lib/actions/payments';
import { getBookingPaymentStatus } from '@/lib/utils/booking';
import { PAYMENT_MODES } from '@/lib/constants/payments';
import { todayISO, daysBetween } from '@/lib/utils/date';
import { DateInput } from '@/components/ui/DateInput';
import { NumberInput } from '@/components/ui/NumberInput';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';

const CANCEL_REASONS = [
  'Guest request',
  'Date change',
  'Payment not received',
  'Duplicate',
  'Overbooking',
  'Other',
] as const;

function Shell({ title, subtitle, accent, onClose, children }: {
  title: string; subtitle?: string; accent: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-stone-50 max-w-lg w-full my-8">
        <div className={`sticky top-0 ${accent} text-white px-6 py-4 flex justify-between items-center`}>
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">{title}</h2>
            {subtitle && <p className="text-xs text-white/80 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="hover:bg-black/20 p-1.5 rounded"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">{children}</div>
      </div>
    </div>
  );
}

const labelCls = 'text-xs text-stone-600 uppercase tracking-wider block mb-1';
const inputCls = 'w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white';

export function CancelRequestModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [reasonType, setReasonType] = useState<string>(CANCEL_REASONS[0]);
  const [detail, setDetail] = useState('');

  const submit = () => {
    const reason = reasonType === 'Other' ? detail.trim() : detail.trim() ? `${reasonType} — ${detail.trim()}` : reasonType;
    if (reasonType === 'Other' && !detail.trim()) { toast.error('Please describe the reason'); return; }
    startTransition(async () => {
      const res = await requestCancellation(booking.id, reason);
      if (!res.success) { toast.error(res.error); return; }
      toast.success('Cancellation request submitted for approval');
      onClose();
    });
  };

  return (
    <Shell title="Request Cancellation" subtitle={`${booking.confirmationNumber} · ${booking.guestName}`} accent="bg-red-700" onClose={onClose}>
      <div>
        <label className={labelCls}>Reason *</label>
        <select value={reasonType} onChange={e => setReasonType(e.target.value)} className={inputCls}>
          {CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>{reasonType === 'Other' ? 'Details *' : 'Additional notes'}</label>
        <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={3} className={inputCls} />
      </div>
      <div className="bg-amber-50 border-l-4 border-amber-500 p-3 text-xs text-stone-700 italic">
        This goes to a Sales Admin for approval. The booking stays active until approved.
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-stone-300">
        <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 tracking-wider">CANCEL</button>
        <button onClick={submit} disabled={isPending} className="px-6 py-2.5 text-sm bg-red-700 hover:bg-red-800 text-white tracking-wider disabled:opacity-50">
          {isPending ? 'SUBMITTING…' : 'SUBMIT REQUEST'}
        </button>
      </div>
    </Shell>
  );
}

export function PostponeRequestModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [arrival, setArrival] = useState(booking.arrival);
  const [departure, setDeparture] = useState(booking.departure);
  const [reason, setReason] = useState('');
  const nights = daysBetween(arrival, departure);

  const submit = () => {
    if (departure <= arrival) { toast.error('Departure must be after arrival'); return; }
    if (arrival === booking.arrival && departure === booking.departure) { toast.error('Pick new dates first'); return; }
    startTransition(async () => {
      const res = await requestPostponement(booking.id, arrival, departure, reason.trim());
      if (!res.success) { toast.error(res.error); return; }
      toast.success('Postponement request submitted for approval');
      onClose();
    });
  };

  return (
    <Shell title="Request Postponement" subtitle={`${booking.confirmationNumber} · ${booking.guestName}`} accent="bg-amber-600" onClose={onClose}>
      <div className="text-xs text-stone-500">
        Current: <span className="font-medium text-stone-700">{booking.arrival} → {booking.departure}</span> ({booking.nights}n)
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={labelCls}>New Arrival</label><DateInput value={arrival} min={todayISO()} onChange={setArrival} className="w-full" /></div>
        <div><label className={labelCls}>New Departure</label><DateInput value={departure} min={arrival} onChange={setDeparture} className="w-full" /></div>
        <div><label className={labelCls}>Nights</label><input value={nights} readOnly className={`${inputCls} bg-stone-100`} /></div>
      </div>
      <div>
        <label className={labelCls}>Reason / comment</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className={inputCls} placeholder="Why is the guest moving dates?" />
      </div>
      <div className="bg-amber-50 border-l-4 border-amber-500 p-3 text-xs text-stone-700 italic">
        We check the new dates for room conflicts now, and again when you apply after approval.
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-stone-300">
        <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 tracking-wider">CANCEL</button>
        <button onClick={submit} disabled={isPending} className="px-6 py-2.5 text-sm bg-amber-600 hover:bg-amber-700 text-white tracking-wider disabled:opacity-50">
          {isPending ? 'SUBMITTING…' : 'SUBMIT REQUEST'}
        </button>
      </div>
    </Shell>
  );
}

export function RefundModal({ booking, payments, onClose }: { booking: Booking; payments: Payment[]; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const ps = getBookingPaymentStatus(booking, payments);
  const suggested = Math.max(0, ps.totalPaid - ps.totalRefunded);
  const [form, setForm] = useState({
    amount: suggested ? String(suggested) : '',
    mode: 'UPI',
    reference: '',
    paymentDate: todayISO(),
    notes: '',
  });
  const upd = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    const amount = Number(form.amount);
    if (!(amount > 0)) { toast.error('Refund amount must be greater than 0'); return; }
    startTransition(async () => {
      const res = await initiateRefund({
        bookingId: booking.id, amount, mode: form.mode,
        reference: form.reference.trim(), paymentDate: form.paymentDate, notes: form.notes.trim(),
      });
      if (!res.success) { toast.error(res.error); return; }
      toast.success('Refund initiated — Accounts will process it');
      onClose();
    });
  };

  return (
    <Shell title="Initiate Refund" subtitle={`${booking.confirmationNumber} · ${booking.guestName}`} accent="bg-purple-700" onClose={onClose}>
      <div className="bg-stone-100 px-4 py-3 grid grid-cols-2 gap-4 text-sm">
        <div><div className="text-xs text-stone-500 uppercase tracking-wider">Collected</div><div className="font-medium text-emerald-700">₹{ps.totalPaid.toLocaleString('en-IN')}</div></div>
        <div><div className="text-xs text-stone-500 uppercase tracking-wider">Already Refunded</div><div className="font-medium">₹{ps.totalRefunded.toLocaleString('en-IN')}</div></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className={labelCls}>Refund Amount (₹) *</label><NumberInput value={Number(form.amount || 0)} min={0} onChange={n => upd('amount', String(n))} className={inputCls} /></div>
        <div><label className={labelCls}>Refund Date *</label><DateInput value={form.paymentDate} onChange={v => upd('paymentDate', v)} className="w-full" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className={labelCls}>Mode *</label>
          <select value={form.mode} onChange={e => upd('mode', e.target.value)} className={inputCls}>
            {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Reference</label><input value={form.reference} onChange={e => upd('reference', e.target.value)} className={inputCls} placeholder="UTR / txn id" /></div>
      </div>
      <div><label className={labelCls}>Notes</label><textarea value={form.notes} onChange={e => upd('notes', e.target.value)} rows={2} className={inputCls} /></div>
      <div className="flex justify-end gap-3 pt-2 border-t border-stone-300">
        <button onClick={onClose} className="px-5 py-2.5 text-sm border border-stone-300 hover:bg-stone-100 tracking-wider">CANCEL</button>
        <button onClick={submit} disabled={isPending} className="px-6 py-2.5 text-sm bg-purple-700 hover:bg-purple-800 text-white tracking-wider disabled:opacity-50">
          {isPending ? 'SAVING…' : 'INITIATE REFUND'}
        </button>
      </div>
    </Shell>
  );
}
