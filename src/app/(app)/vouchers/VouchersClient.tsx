'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Search, FileText, Printer, Eye, Edit2, Lock, History, Download } from 'lucide-react';
import { fmtDate } from '@/lib/utils/date';
import { buildWaLink, WA_TEMPLATES } from '@/lib/constants/whatsapp';
import { getVoucherShareUrl } from '@/lib/actions/vouchers';
import { isVoucherEditable } from '@/lib/utils/voucher';
import type { Booking } from '@/lib/types/booking';
import type { UserRole } from '@/lib/types/profile';
import { MessageCircle } from 'lucide-react';

const BookingModal = dynamic(() => import('@/components/bookings/BookingModal').then(m => ({ default: m.BookingModal })), { ssr: false });
const VoucherHistoryModal = dynamic(() => import('@/components/vouchers/VoucherHistoryModal').then(m => ({ default: m.VoucherHistoryModal })), { ssr: false });

interface Props {
  initialBookings: Booking[];
  users: Array<{ name: string; role: string }>;
  currentUser: { id: string; name: string; role: UserRole };
}

export function VouchersClient({ initialBookings, users, currentUser }: Props) {
  const [search, setSearch] = useState('');
  const [editVoucherFor, setEditVoucherFor] = useState<Booking | null>(null);
  const [historyFor, setHistoryFor] = useState<Booking | null>(null);
  const canEditVoucher = currentUser.role === 'Sales' || currentUser.role === 'Admin';

  const filtered = useMemo(() => {
    if (!search) return initialBookings.slice().sort((a, b) => b.arrival.localeCompare(a.arrival));
    const q = search.toLowerCase();
    return initialBookings
      .filter(b => `${b.guestName} ${b.confirmationNumber} ${b.contactNumber}`.toLowerCase().includes(q))
      .sort((a, b) => b.arrival.localeCompare(a.arrival));
  }, [initialBookings, search]);

  const handlePrint = (b: Booking) => {
    const win = window.open(`/api/print/voucher?bookingId=${b.id}`, '_blank');
    win?.addEventListener('load', () => setTimeout(() => win.print(), 300));
  };

  const handleView = (b: Booking) => {
    window.open(`/api/print/voucher?bookingId=${b.id}`, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadPdf = (b: Booking) => {
    window.open(`/api/pdf/voucher?bookingId=${b.id}`, '_blank');
  };

  const handleWhatsApp = async (b: Booking) => {
    const voucherUrl = await getVoucherShareUrl(b.id);
    const msg = WA_TEMPLATES.bookingConfirmation(b.guestName, b.confirmationNumber, fmtDate(b.arrival), voucherUrl);
    window.open(buildWaLink(b.contactNumber, msg), '_blank');
  };

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-stone-300">
        <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Booking Vouchers</h2>
        <p className="text-sm text-stone-500 italic">Generate guest confirmations from any booking</p>
      </div>

      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-3 text-stone-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a booking..." className="w-full pl-9 pr-3 py-2 border border-stone-300 text-sm bg-white outline-none focus:border-emerald-700" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {filtered.length === 0 ? (
          <div className="col-span-2 p-12 bg-white border border-stone-200 text-center text-stone-400 italic">No bookings found</div>
        ) : (
          filtered.map(b => (
            <div key={b.id} className="bg-white border border-stone-200 p-4 hover:border-amber-400 hover:shadow-sm transition group">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-medium">{b.guestName}</div>
                  <div className="text-xs text-stone-500 font-mono">{b.confirmationNumber}</div>
                </div>
                <FileText size={16} className="text-stone-300 group-hover:text-amber-600 transition" />
              </div>
              <div className="text-xs text-stone-600 space-y-0.5 mb-3">
                <div>{fmtDate(b.arrival)} → {fmtDate(b.departure)} ({b.nights} {b.nights === 1 ? 'night' : 'nights'})</div>
                <div>{b.rooms?.length} rooms · {b.adults}A/{b.children}C</div>
                <div className="font-medium text-emerald-800">₹{b.totalAmount.toLocaleString('en-IN')}</div>
              </div>
              <div className="flex gap-2">
                {canEditVoucher && (
                  isVoucherEditable(b.arrival) ? (
                    <button onClick={() => setEditVoucherFor(b)} title="Edit voucher" className="flex items-center justify-center gap-1 text-xs border border-amber-600 text-amber-700 px-3 py-1.5 hover:bg-amber-50 transition tracking-wider">
                      <Edit2 size={12} /> EDIT
                    </button>
                  ) : (
                    <button disabled title="Locked — editing closes 12 hours before check-in" className="flex items-center justify-center gap-1 text-xs border border-stone-200 text-stone-300 px-3 py-1.5 cursor-not-allowed">
                      <Lock size={12} />
                    </button>
                  )
                )}
                {canEditVoucher && (
                  <button onClick={() => setHistoryFor(b)} title="Edit history" className="flex items-center justify-center gap-1 text-xs border border-stone-300 text-stone-600 px-3 py-1.5 hover:bg-stone-50 transition tracking-wider">
                    <History size={12} />
                  </button>
                )}
                <button onClick={() => handleView(b)} className="flex items-center justify-center gap-1 text-xs border border-emerald-700 text-emerald-800 px-3 py-1.5 hover:bg-emerald-50 transition tracking-wider">
                  <Eye size={12} /> VIEW
                </button>
                <button onClick={() => handleDownloadPdf(b)} title="Download PDF voucher" className="flex items-center justify-center gap-1 text-xs border border-amber-600 text-amber-700 px-3 py-1.5 hover:bg-amber-50 transition tracking-wider">
                  <Download size={12} /> PDF
                </button>
                <button onClick={() => handlePrint(b)} className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-emerald-900 text-amber-100 py-1.5 hover:bg-emerald-800 transition tracking-wider">
                  <Printer size={12} /> PRINT VOUCHER
                </button>
                <button onClick={() => handleWhatsApp(b)}
                  className="flex items-center justify-center gap-1 text-xs border border-green-600 text-green-700 px-3 py-1.5 hover:bg-green-50 transition">
                  <MessageCircle size={12} /> WA
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {editVoucherFor && (
        <BookingModal
          booking={editVoucherFor}
          users={users}
          currentUser={currentUser}
          existingBookings={initialBookings}
          voucherEdit
          onClose={() => setEditVoucherFor(null)}
        />
      )}

      {historyFor && <VoucherHistoryModal booking={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}
