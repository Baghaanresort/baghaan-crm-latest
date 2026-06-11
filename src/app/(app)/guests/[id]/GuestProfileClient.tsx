'use client';

import { useState, useTransition, useMemo } from 'react';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { updateGuest } from '@/lib/actions/guests';
import { fmtDate } from '@/lib/utils/date';
import { buildWaLink, WA_TEMPLATES } from '@/lib/constants/whatsapp';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import type { UserRole } from '@/lib/types/profile';

interface Guest {
  id: string; name: string; phone: string; email: string;
  companyName: string; gstNumber: string;
  preferences: string; internalNotes: string;
  createdAt: string; updatedAt: string;
}

interface Props {
  guest: Guest;
  bookings: Booking[];
  payments: Payment[];
  currentUser: { id: string; name: string; role: UserRole };
  today: string;
}

export function GuestProfileClient({ guest, bookings, payments, currentUser, today }: Props) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: guest.name,
    phone: guest.phone,
    email: guest.email,
    companyName: guest.companyName,
    gstNumber: guest.gstNumber,
    preferences: guest.preferences,
    internalNotes: guest.internalNotes,
  });

  const stats = useMemo(() => {
    const totalStays = bookings.length;
    // Total spend = verified payments only (spec requirement)
    const totalSpend = payments.filter(p => p.verified).reduce((s, p) => s + p.amount, 0);
    const totalNights = bookings.reduce((s, b) => s + b.nights, 0);
    const lastStay = bookings.find(b => b.departure <= today)?.arrival ?? null;
    return { totalStays, totalSpend, totalNights, lastStay };
  }, [bookings, payments, today]);

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateGuest(guest.id, form);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Guest profile updated');
      setEditing(false);
    });
  };

  const update = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      {/* Back */}
      <Link href="/guests" className="text-stone-500 hover:text-stone-700 flex items-center gap-1 text-sm mb-6 w-fit">
        <ArrowLeft size={14} /> Guest Directory
      </Link>

      {/* Header */}
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
            {guest.name || guest.phone}
          </h2>
          {guest.companyName && (
            <p className="text-sm text-stone-500 italic">{guest.companyName}</p>
          )}
        </div>
        <a
          href={buildWaLink(guest.phone, WA_TEMPLATES.enquiryGreeting(guest.name))}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm bg-green-600 text-white px-4 py-2 hover:bg-green-700 transition"
        >
          <MessageCircle size={14} /> WhatsApp
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Stays', value: stats.totalStays, sub: stats.totalStays === 1 ? 'visit' : 'visits', accent: stats.totalStays > 2 },
          { label: 'Total Nights', value: stats.totalNights, sub: 'nights stayed', accent: false },
          { label: 'Verified Spend', value: `₹${stats.totalSpend.toLocaleString('en-IN')}`, sub: 'verified payments only', accent: stats.totalSpend > 0 },
          { label: 'Last Stay', value: stats.lastStay ? fmtDate(stats.lastStay) : '—', sub: stats.lastStay ? 'most recent arrival' : 'First visit', accent: false },
        ].map(({ label, value, sub, accent }) => (
          <div key={label} className="bg-white border border-stone-200 p-4">
            <div className="text-xs text-stone-500 uppercase tracking-wider">{label}</div>
            <div className={`text-xl mt-2 font-semibold ${accent ? 'text-emerald-800' : 'text-stone-800'}`}
              style={{ fontFamily: "'Cormorant Garamond', serif" }}>{value}</div>
            <div className="text-xs text-stone-400 mt-1 italic">{sub}</div>
          </div>
        ))}
      </div>

      {/* Repeat guest badge */}
      {stats.totalStays > 1 && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-2.5 mb-6 flex items-center gap-2">
          <span className="font-medium">Returning Guest</span>
          <span className="text-stone-500">·</span>
          <span>{stats.totalStays} stays · ₹{stats.totalSpend.toLocaleString('en-IN')} total spend · Last stay {stats.lastStay ? fmtDate(stats.lastStay) : '—'}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Guest details — editable */}
        <div className="bg-white border border-stone-200 p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm uppercase tracking-wider text-emerald-900">Guest Details</h3>
            {!editing && (
              <button onClick={() => setEditing(true)} className="text-xs text-stone-400 hover:text-stone-700 underline">Edit</button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              {([['Name', 'name'], ['Phone', 'phone'], ['Email', 'email'], ['Company', 'companyName'], ['GST Number', 'gstNumber']] as [string, keyof typeof form][]).map(([label, key]) => (
                <div key={key}>
                  <label className="text-xs text-stone-500 uppercase tracking-wider block mb-1">{label}</label>
                  <input value={form[key]} onChange={e => update(key, e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white" />
                </div>
              ))}
              <div>
                <label className="text-xs text-stone-500 uppercase tracking-wider block mb-1">Preferences</label>
                <textarea value={form.preferences} onChange={e => update('preferences', e.target.value)} rows={2}
                  placeholder="Dietary needs, room preferences, special occasions..."
                  className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white" />
              </div>
              <div>
                <label className="text-xs text-stone-500 uppercase tracking-wider block mb-1">Internal Notes</label>
                <textarea value={form.internalNotes} onChange={e => update('internalNotes', e.target.value)} rows={2}
                  placeholder="Staff notes — not shown to guest"
                  className="w-full px-3 py-2 border border-stone-300 text-sm outline-none focus:border-emerald-700 bg-white" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSave} disabled={isPending}
                  className="text-xs bg-emerald-700 text-white px-4 py-1.5 hover:bg-emerald-800 disabled:opacity-50 tracking-wider">
                  {isPending ? 'SAVING…' : 'SAVE'}
                </button>
                <button onClick={() => setEditing(false)} className="text-xs border border-stone-300 px-3 py-1.5 hover:bg-stone-100">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5 text-sm">
              <Row label="Phone" value={
                <a href={buildWaLink(guest.phone, WA_TEMPLATES.enquiryGreeting(guest.name))}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-green-700 transition">
                  <MessageCircle size={12} className="text-green-600" /> {guest.phone}
                </a>
              } />
              {guest.email && <Row label="Email" value={guest.email} />}
              {guest.companyName && <Row label="Company" value={guest.companyName} />}
              {guest.gstNumber && <Row label="GST" value={guest.gstNumber} />}
              {guest.preferences && <Row label="Preferences" value={guest.preferences} />}
              {guest.internalNotes && (
                <Row label="Staff Notes" value={<span className="italic text-stone-500">{guest.internalNotes}</span>} />
              )}
              <div className="text-xs text-stone-400 pt-1">
                Guest since {fmtDate(guest.createdAt)}
              </div>
            </div>
          )}
        </div>

        {/* Stay history */}
        <div className="col-span-2 bg-white border border-stone-200 p-5">
          <h3 className="text-sm uppercase tracking-wider text-emerald-900 mb-4">
            Stay History · {bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'}
          </h3>

          {bookings.length === 0 ? (
            <p className="text-sm text-stone-400 italic">No bookings linked to this guest profile yet.</p>
          ) : (
            <div className="space-y-2">
              {bookings.map(b => {
                const isActive = b.arrival <= today && b.departure > today;
                const isUpcoming = b.arrival > today;
                const bookingPayments = payments.filter(p => p.bookingId === b.id);
                const paid = bookingPayments.filter(p => p.verified).reduce((s, p) => s + p.amount, 0);
                const balance = b.totalAmount - paid;

                return (
                  <div key={b.id} className={`border p-3 ${isActive ? 'border-emerald-300 bg-emerald-50/50' : isUpcoming ? 'border-blue-200 bg-blue-50/30' : 'border-stone-100'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-xs text-stone-400">{b.confirmationNumber}</span>
                          {isActive && <span className="text-xs bg-emerald-100 text-emerald-800 px-1.5 py-0.5">In House</span>}
                          {isUpcoming && <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5">Upcoming</span>}
                        </div>
                        <div className="text-sm font-medium">
                          {fmtDate(b.arrival)} → {fmtDate(b.departure)}
                        </div>
                        <div className="text-xs text-stone-500 mt-0.5">
                          {b.nights}n · {b.rooms?.length} {(b.rooms?.length ?? 0) === 1 ? 'room' : 'rooms'} · {b.adults}A/{b.children}C
                          {b.bookingType === 'corporate' && <span className="ml-1 text-purple-600">· Corporate</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-sm">₹{b.totalAmount.toLocaleString('en-IN')}</div>
                        {paid > 0 && (
                          <div className={`text-xs ${b.totalAmount > 0 && balance <= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {b.totalAmount > 0 && balance <= 0 ? 'Paid ✓' : `₹${balance.toLocaleString('en-IN')} due`}
                          </div>
                        )}
                        <div className="text-xs text-stone-400 mt-0.5">{b.createdBy}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 border-b border-stone-100 pb-2">
      <span className="text-stone-400 w-24 flex-shrink-0 text-xs uppercase tracking-wider pt-0.5">{label}</span>
      <span className="text-stone-800 text-sm">{value}</span>
    </div>
  );
}
