'use client';

import { X } from 'lucide-react';

interface Props {
  // The held booking whose voucher we preview before confirming. Null means the
  // enquiry has no linked hold (shouldn't happen at advance_confirmed) — we show
  // a fallback instead of a broken iframe.
  bookingId: string | null;
  guestName?: string;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function BookingPreviewModal({ bookingId, guestName, isPending, onConfirm, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-stone-50 w-full max-w-3xl my-8 flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="sticky top-0 bg-emerald-900 text-white px-6 py-4 flex justify-between items-center">
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }} className="text-xl tracking-wider">Review Voucher</h2>
            <p className="text-xs text-white/80 mt-0.5">
              {guestName ? `${guestName} · ` : ''}Confirm the details below to book this reservation.
            </p>
          </div>
          <button onClick={onClose} className="hover:bg-black/20 p-1.5 rounded"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-hidden bg-stone-200 p-2">
          {bookingId ? (
            <iframe
              key={bookingId}
              src={`/api/print/voucher?bookingId=${bookingId}`}
              title="Voucher preview"
              className="w-full h-full bg-white"
              style={{ minHeight: '55vh', border: 'none' }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-stone-500 italic p-10 text-center">
              Couldn&apos;t load the voucher — no held booking is linked to this enquiry.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-stone-200 bg-stone-50">
          <button
            onClick={onClose}
            disabled={isPending}
            className="text-sm px-4 py-2 border border-stone-300 text-stone-600 hover:bg-stone-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending || !bookingId}
            className="text-sm px-5 py-2 bg-emerald-900 text-amber-100 hover:bg-emerald-800 disabled:opacity-50 tracking-wider"
          >
            {isPending ? 'Booking…' : 'Confirm Booking'}
          </button>
        </div>
      </div>
    </div>
  );
}
