'use client';

import { Fragment } from 'react';
import { X, Printer } from 'lucide-react';
import { fmtDate, datesInRange } from '@/lib/utils/date';
import { BILLING_ENTITIES } from '@/lib/constants/billing';
import type { Booking } from '@/lib/types/booking';

interface Props {
  booking: Booking;
  onClose: () => void;
}

export function ProformaInvoicePreview({ booking, onClose }: Props) {
  const pi = booking.proformaInvoice;
  if (!pi) return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 max-w-md">
        <p>No proforma invoice generated yet for this booking.</p>
        <button onClick={onClose} className="mt-4 px-4 py-2 bg-stone-200 text-sm">Close</button>
      </div>
    </div>
  );

  const entity = BILLING_ENTITIES[pi.billingEntity ?? 'baghaan']!;
  const stayDays = datesInRange(booking.arrival, booking.departure);
  const ibd: Record<string, typeof pi.lineItems> = {};
  (pi.lineItems ?? []).forEach(li => { const k = li.day || 'multi'; if (!ibd[k]) ibd[k] = []; ibd[k]!.push(li); });
  const balance = Math.max(0, pi.grandTotal - (pi.advanceRequired ?? 0));

  const handlePrint = () => {
    const win = window.open(`/api/print/pi?bookingId=${booking.id}`, '_blank');
    win?.addEventListener('load', () => setTimeout(() => win.print(), 300));
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white max-w-3xl w-full my-8">
        <div className="sticky top-0 bg-purple-700 text-white px-6 py-4 flex justify-between items-center z-10">
          <div><h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">Proforma Invoice</h2><p className="text-xs text-purple-100 font-mono">{pi.piNumber}</p></div>
          <div className="flex gap-3">
            <button onClick={handlePrint} className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-1.5 text-sm flex items-center gap-2"><Printer size={14} /> PRINT / SAVE PDF</button>
            <button onClick={onClose} className="hover:bg-purple-800 p-1.5 rounded"><X size={18} /></button>
          </div>
        </div>
        <div className="p-8" style={{ fontSize: '12px', lineHeight: '1.5' }}>
          {/* Header */}
          <div className="text-center pb-3 border-b-2 border-amber-600 mb-4">
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, fontSize: '28px', letterSpacing: '0.25em' }} className="text-emerald-900">BAGHAAN</h1>
            <p className="text-xs tracking-widest text-amber-700">ORCHARD · RETREAT</p>
            <p className="text-xs text-stone-600 mt-2">{entity.address}</p>
            <p className="text-xs text-stone-600">Corporate Office: {entity.corpOffice}</p>
            <p className="text-xs text-stone-600">Telephone: {entity.phones} · GST: {entity.gst}</p>
          </div>
          {/* Meta */}
          <div className="flex justify-between mb-3">
            <div>
              <div className="text-xs text-stone-500 uppercase tracking-wider">Billed To</div>
              <div className="font-medium mt-1">{booking.companyName}</div>
              {booking.companyAddress && <div className="text-xs">{booking.companyAddress}</div>}
              {booking.companyGST && <div className="text-xs text-stone-600">GST: {booking.companyGST}</div>}
              <div className="text-xs text-stone-600 mt-1">Contact: {booking.contactName} · {booking.contactNumber}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-stone-500 uppercase tracking-wider">Proforma Invoice No.</div>
              <div className="font-mono font-medium mt-1">{pi.piNumber}</div>
              <div className="text-xs text-stone-600 mt-2">Date: {fmtDate(pi.generatedAt)}</div>
              <div className="text-xs text-stone-600">Check In: {fmtDate(booking.arrival)}</div>
              <div className="text-xs text-stone-600">Check Out: {fmtDate(booking.departure)}</div>
              <div className="text-xs text-stone-600">Nights: {booking.nights}</div>
            </div>
          </div>
          {/* Line items table */}
          <table className="w-full text-sm border border-stone-200 mt-3">
            <thead className="bg-emerald-900 text-amber-100">
              <tr><th className="text-left p-2 text-xs uppercase tracking-wider">Particulars</th><th className="text-right p-2 text-xs uppercase">Rate</th><th className="text-right p-2 text-xs uppercase">No./Units</th><th className="text-right p-2 text-xs uppercase">Total (₹)</th></tr>
            </thead>
            <tbody>
              {stayDays.map(day => {
                const di = ibd[day] ?? [];
                if (!di.length) return null;
                return (
                  <Fragment key={`day-${day}`}>
                    <tr className="bg-amber-50"><td colSpan={4} className="p-2 text-xs uppercase tracking-wider font-medium text-amber-900">{fmtDate(day)}</td></tr>
                    {di.map((li, j) => { const t = Number(li.rate ?? 0) * Number(li.qty ?? 1) * Number(li.units ?? 1); return (
                      <tr key={`${day}-${j}`} className="border-t border-stone-100">
                        <td className="p-2">{li.particular}</td><td className="p-2 text-right">{Number(li.rate).toLocaleString('en-IN')}</td>
                        <td className="p-2 text-right">{li.qty}{li.units > 1 ? ` × ${li.units}` : ''}</td><td className="p-2 text-right">{t.toLocaleString('en-IN')}</td>
                      </tr>
                    ); })}
                  </Fragment>
                );
              })}
              {(ibd['multi'] ?? []).length > 0 && (
                <>
                  <tr className="bg-amber-50"><td colSpan={4} className="p-2 text-xs uppercase tracking-wider font-medium text-amber-900">Multi-Day / Equipment</td></tr>
                  {(ibd['multi'] ?? []).map((li, j) => { const t = Number(li.rate ?? 0) * Number(li.qty ?? 1) * Number(li.units ?? 1); return (
                    <tr key={`multi-${j}`} className="border-t border-stone-100"><td className="p-2">{li.particular}</td><td className="p-2 text-right">{Number(li.rate).toLocaleString('en-IN')}</td><td className="p-2 text-right">{li.qty}{li.units > 1 ? ` × ${li.units}` : ''}</td><td className="p-2 text-right">{t.toLocaleString('en-IN')}</td></tr>
                  ); })}
                </>
              )}
              <tr className="bg-emerald-900 text-amber-100"><td colSpan={3} className="p-3 uppercase tracking-wider text-xs">GRAND TOTAL</td><td className="p-3 text-right font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '16px' }}>₹{pi.grandTotal.toLocaleString('en-IN')}</td></tr>
              <tr><td colSpan={4} className="p-2 text-xs italic text-stone-500">(Rupees {undefined/* will use numberToIndianWords in print HTML */}...)</td></tr>
            </tbody>
          </table>
          {/* Payment box */}
          <div className="bg-amber-50 border-2 border-amber-400 p-4 mt-4 text-sm">
            <div className="font-medium text-amber-900 uppercase tracking-wider text-xs mb-2">Payment Terms</div>
            <div className="flex justify-between"><span>Advance Required (50%)</span><span className="font-medium">₹{pi.advanceRequired.toLocaleString('en-IN')}</span></div>
            <div className="flex justify-between"><span>Balance (before checkout)</span><span className="font-medium">₹{balance.toLocaleString('en-IN')}</span></div>
            <div className="text-xs text-stone-600 mt-2">{pi.paymentTerms}</div>
          </div>
          {/* Bank details */}
          <div className="bg-stone-50 border border-stone-200 p-4 mt-3 text-xs">
            <div className="font-medium text-emerald-900 uppercase tracking-wider mb-2">Bank Details</div>
            <div><span className="text-stone-500">Payable to:</span> <span className="font-medium">{entity.payeeName}</span></div>
            <div><span className="text-stone-500">Bank:</span> {entity.bank.name} · <span className="text-stone-500">Branch:</span> {entity.bank.branch}</div>
            <div><span className="text-stone-500">Account No.:</span> <span className="font-mono">{entity.bank.accountNo}</span> · <span className="text-stone-500">IFSC:</span> <span className="font-mono">{entity.bank.ifsc}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
