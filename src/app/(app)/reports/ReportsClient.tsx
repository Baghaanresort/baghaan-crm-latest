'use client';

import { useState, useMemo } from 'react';
import { Download } from 'lucide-react';
import { getEffectiveStatus, getBookingPaymentStatus } from '@/lib/utils/booking';
import { fmtDate } from '@/lib/utils/date';
import { DateInput } from '@/components/ui/DateInput';
import { TOTAL_ROOMS as TR } from '@/lib/constants/rooms';
import { ENQUIRY_STATUSES } from '@/lib/constants/enquiry';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import type { Enquiry } from '@/lib/types/enquiry';

interface Props {
  bookings: Booking[];
  payments: Payment[];
  enquiries: Enquiry[];
}

type ReportTab = 'revenue' | 'payments' | 'occupancy' | 'agents' | 'conversion';

export function ReportsClient({ bookings, payments, enquiries }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';

  const [tab, setTab] = useState<ReportTab>('revenue');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const effStatus = (b: Booking) => getEffectiveStatus(b, payments);
  const pStats = (b: Booking) => getBookingPaymentStatus(b, payments);

  const filteredBookings = useMemo(() =>
    bookings.filter(b => b.arrival >= from && b.arrival <= to && effStatus(b) !== 'hold'),
    [bookings, from, to, payments]
  );

  const filteredPayments = useMemo(() =>
    payments.filter(p => p.verified && p.paymentDate >= from && p.paymentDate <= to),
    [payments, from, to]
  );

  const filteredEnquiries = useMemo(() =>
    enquiries.filter(e => e.date >= from && e.date <= to),
    [enquiries, from, to]
  );

  // Revenue summary
  const revenue = useMemo(() => {
    const total = filteredBookings.reduce((s, b) => s + b.totalAmount, 0);
    const byAgent: Record<string, { bookings: number; revenue: number }> = {};
    filteredBookings.forEach(b => {
      if (!byAgent[b.createdBy]) byAgent[b.createdBy] = { bookings: 0, revenue: 0 };
      byAgent[b.createdBy]!.bookings++;
      byAgent[b.createdBy]!.revenue += b.totalAmount;
    });
    return { total, byAgent: Object.entries(byAgent).sort((a, b) => b[1].revenue - a[1].revenue) };
  }, [filteredBookings]);

  // Payment summary
  const paymentSummary = useMemo(() => {
    const total = filteredPayments.reduce((s, p) => s + p.amount, 0);
    const byMode: Record<string, number> = {};
    filteredPayments.forEach(p => { byMode[p.mode] = (byMode[p.mode] ?? 0) + p.amount; });
    return { total, byMode: Object.entries(byMode).sort((a, b) => b[1] - a[1]) };
  }, [filteredPayments]);

  // Occupancy
  const occupancy = useMemo(() => {
    const days = Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
    const totalAvailable = TR * days;
    let roomNights = 0;
    filteredBookings.forEach(b => {
      const overlap = b.rooms.length * Math.max(0,
        Math.min(new Date(to).getTime(), new Date(b.departure).getTime()) -
        Math.max(new Date(from).getTime(), new Date(b.arrival).getTime())
      ) / 86400000;
      roomNights += overlap;
    });
    const occ = totalAvailable > 0 ? (roomNights / totalAvailable) * 100 : 0;
    const adr = roomNights > 0 ? revenue.total / roomNights : 0;
    return { roomNights: Math.round(roomNights), totalAvailable, occ, adr, revpar: adr * occ / 100 };
  }, [filteredBookings, from, to, revenue.total]);

  // Enquiry conversion
  const conversionStats = useMemo(() => {
    const total = filteredEnquiries.length;
    const byStatus: Record<string, number> = {};
    filteredEnquiries.forEach(e => { byStatus[e.status] = (byStatus[e.status] ?? 0) + 1; });
    const booked = byStatus['booked'] ?? 0;
    const lost = byStatus['lost'] ?? 0;
    const convRate = total > 0 ? (booked / total) * 100 : 0;

    const bySource: Record<string, { total: number; booked: number }> = {};
    filteredEnquiries.forEach(e => {
      if (!bySource[e.source]) bySource[e.source] = { total: 0, booked: 0 };
      bySource[e.source]!.total++;
      if (e.status === 'booked') bySource[e.source]!.booked++;
    });

    const byLostReason: Record<string, number> = {};
    filteredEnquiries.filter(e => e.status === 'lost' && e.lostReason).forEach(e => {
      byLostReason[e.lostReason] = (byLostReason[e.lostReason] ?? 0) + 1;
    });

    return { total, booked, lost, convRate, bySource: Object.entries(bySource).sort((a, b) => b[1].total - a[1].total), byLostReason: Object.entries(byLostReason).sort((a, b) => b[1] - a[1]) };
  }, [filteredEnquiries]);

  const TABS: [ReportTab, string][] = [
    ['revenue', 'Revenue'],
    ['payments', 'Payments Ledger'],
    ['occupancy', 'Occupancy'],
    ['agents', 'Agent Performance'],
    ['conversion', 'Enquiry Conversion'],
  ];

  return (
    <div>
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Reports</h2>
          <p className="text-sm text-stone-500 italic">Custom date-range analysis</p>
        </div>
        {/* Date range */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-stone-500 uppercase tracking-wider">From</label>
          <DateInput value={from} onChange={v => setFrom(v)} className="min-w-[150px]" />
          <label className="text-xs text-stone-500 uppercase tracking-wider">To</label>
          <DateInput value={to} onChange={v => setTo(v)} className="min-w-[150px]" />
        </div>
      </div>

      {/* Report tabs */}
      <div className="flex gap-1 mb-6 border-b border-stone-200 overflow-x-auto">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm whitespace-nowrap transition border-b-2 ${tab === key ? 'border-emerald-700 text-emerald-900 font-medium' : 'border-transparent text-stone-500 hover:text-stone-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Revenue Report */}
      {tab === 'revenue' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            {[['Bookings', filteredBookings.length, ''], ['Total Revenue', `₹${revenue.total.toLocaleString('en-IN')}`, 'text-emerald-700'], ['Avg per Booking', filteredBookings.length > 0 ? `₹${Math.round(revenue.total / filteredBookings.length).toLocaleString('en-IN')}` : '—', '']].map(([l, v, c]) => (
              <div key={String(l)} className="bg-white border border-stone-200 p-4">
                <div className="text-xs text-stone-500 uppercase tracking-wider">{l}</div>
                <div className={`text-xl mt-1 font-semibold ${c}`} style={{ fontFamily: "'Cormorant Garamond', serif" }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="bg-white border border-stone-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-800 text-stone-100">
                <tr>
                  <th className="text-left p-3 text-xs uppercase">Confirmation #</th>
                  <th className="text-left p-3 text-xs uppercase">Guest</th>
                  <th className="text-left p-3 text-xs uppercase">Arrival</th>
                  <th className="text-left p-3 text-xs uppercase">Nights</th>
                  <th className="text-left p-3 text-xs uppercase">Agent</th>
                  <th className="text-right p-3 text-xs uppercase">Total</th>
                  <th className="text-right p-3 text-xs uppercase">Paid</th>
                  <th className="text-right p-3 text-xs uppercase">Balance</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map(b => { const ps = pStats(b); return (
                  <tr key={b.id} className="border-t border-stone-100 hover:bg-stone-50">
                    <td className="p-3 font-mono text-xs">{b.confirmationNumber}</td>
                    <td className="p-3 font-medium">{b.guestName}</td>
                    <td className="p-3 text-xs">{fmtDate(b.arrival)}</td>
                    <td className="p-3 text-xs">{b.nights}</td>
                    <td className="p-3 text-xs text-stone-500">{b.createdBy}</td>
                    <td className="p-3 text-right">₹{b.totalAmount.toLocaleString('en-IN')}</td>
                    <td className="p-3 text-right text-xs text-emerald-700">₹{ps.totalPaid.toLocaleString('en-IN')}</td>
                    <td className={`p-3 text-right text-xs ${ps.balance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>₹{ps.balance.toLocaleString('en-IN')}</td>
                  </tr>
                ); })}
                {filteredBookings.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-stone-400 italic">No bookings in this period</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <a href={`/api/export/bookings?from=${from}&to=${to}`} className="flex items-center gap-1.5 text-xs border border-stone-300 px-3 py-2 hover:bg-stone-50"><Download size={12} /> Export CSV</a>
          </div>
        </div>
      )}

      {/* Payments Ledger */}
      {tab === 'payments' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[['Verified Payments', filteredPayments.length, ''], ['Total Collected', `₹${paymentSummary.total.toLocaleString('en-IN')}`, 'text-emerald-700'], ['Payment Modes', paymentSummary.byMode.length, '']].map(([l, v, c]) => (
              <div key={String(l)} className="bg-white border border-stone-200 p-4">
                <div className="text-xs text-stone-500 uppercase tracking-wider">{l}</div>
                <div className={`text-xl mt-1 font-semibold ${c}`} style={{ fontFamily: "'Cormorant Garamond', serif" }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-stone-200 p-4">
              <h3 className="text-xs uppercase tracking-wider text-stone-600 mb-3">By Mode</h3>
              {paymentSummary.byMode.map(([mode, amt]) => (
                <div key={mode} className="flex justify-between text-sm border-b border-stone-100 py-1.5">
                  <span>{mode}</span><span className="font-medium">₹{amt.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>
          <a href={`/api/export/payments`} className="inline-flex items-center gap-1.5 text-xs border border-stone-300 px-3 py-2 hover:bg-stone-50"><Download size={12} /> Export CSV</a>
        </div>
      )}

      {/* Occupancy */}
      {tab === 'occupancy' && (
        <div className="grid grid-cols-2 gap-4">
          {[
            ['Room-Nights Sold', occupancy.roomNights, ''],
            ['Available Room-Nights', occupancy.totalAvailable, ''],
            ['Occupancy Rate', `${occupancy.occ.toFixed(1)}%`, 'text-emerald-700'],
            ['ADR', `₹${Math.round(occupancy.adr).toLocaleString('en-IN')}`, ''],
            ['RevPAR', `₹${Math.round(occupancy.revpar).toLocaleString('en-IN')}`, ''],
          ].map(([l, v, c]) => (
            <div key={String(l)} className="bg-white border border-stone-200 p-5">
              <div className="text-xs text-stone-500 uppercase tracking-wider">{l}</div>
              <div className={`text-2xl mt-2 font-semibold ${c}`} style={{ fontFamily: "'Cormorant Garamond', serif" }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Agent Performance */}
      {tab === 'agents' && (
        <div className="bg-white border border-stone-200">
          <table className="w-full text-sm">
            <thead className="bg-stone-800 text-stone-100">
              <tr>
                <th className="text-left p-3 text-xs uppercase">Agent</th>
                <th className="text-right p-3 text-xs uppercase">Bookings</th>
                <th className="text-right p-3 text-xs uppercase">Revenue</th>
                <th className="text-right p-3 text-xs uppercase">Avg Booking</th>
              </tr>
            </thead>
            <tbody>
              {revenue.byAgent.map(([agent, s]) => (
                <tr key={agent} className="border-t border-stone-100 hover:bg-stone-50">
                  <td className="p-3 font-medium">{agent}</td>
                  <td className="p-3 text-right">{s.bookings}</td>
                  <td className="p-3 text-right font-medium">₹{s.revenue.toLocaleString('en-IN')}</td>
                  <td className="p-3 text-right text-xs text-stone-500">₹{Math.round(s.revenue / s.bookings).toLocaleString('en-IN')}</td>
                </tr>
              ))}
              {revenue.byAgent.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-stone-400 italic">No data</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Enquiry Conversion */}
      {tab === 'conversion' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[['Total Enquiries', conversionStats.total, ''], ['Converted', conversionStats.booked, 'text-emerald-700'], ['Lost', conversionStats.lost, 'text-stone-500'], ['Conv. Rate', `${conversionStats.convRate.toFixed(1)}%`, 'text-emerald-700']].map(([l, v, c]) => (
              <div key={String(l)} className="bg-white border border-stone-200 p-4">
                <div className="text-xs text-stone-500 uppercase tracking-wider">{l}</div>
                <div className={`text-xl mt-1 font-semibold ${c}`} style={{ fontFamily: "'Cormorant Garamond', serif" }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-stone-200 p-4">
              <h3 className="text-xs uppercase tracking-wider text-stone-600 mb-4">Conversion Rate by Source</h3>
              <div className="space-y-3">
                {conversionStats.bySource.map(([source, s]) => {
                  const rate = s.total > 0 ? Math.round(s.booked / s.total * 100) : 0;
                  return (
                    <div key={source}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-stone-700">{source}</span>
                        <span className="text-stone-500">{s.booked}/{s.total} booked · <span className={`font-semibold ${rate >= 50 ? 'text-emerald-700' : rate >= 25 ? 'text-amber-700' : 'text-red-600'}`}>{rate}%</span></span>
                      </div>
                      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${rate >= 50 ? 'bg-emerald-500' : rate >= 25 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${rate}%` }} />
                      </div>
                    </div>
                  );
                })}
                {conversionStats.bySource.length === 0 && <p className="text-stone-400 italic text-sm">No data for this period</p>}
              </div>
            </div>
            {conversionStats.byLostReason.length > 0 && (
              <div className="bg-white border border-stone-200 p-4">
                <h3 className="text-xs uppercase tracking-wider text-stone-600 mb-3">Lost Reasons</h3>
                {conversionStats.byLostReason.map(([reason, count]) => (
                  <div key={reason} className="flex justify-between text-sm border-b border-stone-100 py-1.5">
                    <span>{reason}</span><span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <a href={`/api/export/enquiries`} className="inline-flex items-center gap-1.5 text-xs border border-stone-300 px-3 py-2 hover:bg-stone-50"><Download size={12} /> Export CSV</a>
        </div>
      )}
    </div>
  );
}
