'use client';

import { useMemo, useState } from 'react';
import { Plus, Calendar, ShieldCheck, Building2 } from 'lucide-react';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import type { UserRole } from '@/lib/types/profile';
import { getEffectiveStatus, getBookingPaymentStatus } from '@/lib/utils/booking';
import { fmtDate, fmtRelative, datesInRange } from '@/lib/utils/date';
import { ROLE_SUBTITLE } from '@/lib/constants/roles';
import { TOTAL_ROOMS } from '@/lib/constants/rooms';
import { OPERATIONAL_ROLES } from '@/lib/types/profile';
import dynamic from 'next/dynamic';

const BookingModal = dynamic(() => import('@/components/bookings/BookingModal').then(m => ({ default: m.BookingModal })), { ssr: false });
const BlockModal = dynamic(() => import('@/components/bookings/BlockModal').then(m => ({ default: m.BlockModal })), { ssr: false });
const PaymentModal = dynamic(() => import('@/components/payments/PaymentModal').then(m => ({ default: m.PaymentModal })), { ssr: false });
const FinalBillModal = dynamic(() => import('@/components/front-office/FinalBillModal').then(m => ({ default: m.FinalBillModal })), { ssr: false });

interface Props {
  bookings: Booking[];
  payments: Payment[];
  users: Array<{ name: string; role: string }>;
  currentUser: { id: string; name: string; role: UserRole };
  today: string;
}

export function DashboardClient({ bookings, payments, users, currentUser, today }: Props) {
  const role = currentUser.role;
  const isOp = OPERATIONAL_ROLES.includes(role);
  const isFO = role === 'Front Office';
  const isSales = role === 'Sales';
  const isAdmin = role === 'Admin';
  const isAccounts = role === 'Accounts';

  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [paymentFor, setPaymentFor] = useState<Booking | null>(null);
  const [finalBillFor, setFinalBillFor] = useState<Booking | null>(null);

  const pStats = useMemo(() => {
    return (b: Booking) => getBookingPaymentStatus(b, payments);
  }, [payments]);

  const effStatus = useMemo(() => {
    return (b: Booking) => getEffectiveStatus(b, payments);
  }, [payments]);

  const stats = useMemo(() => {
    const arrivingToday = bookings.filter(b => b.arrival === today && effStatus(b) !== 'hold');
    const departingToday = bookings.filter(b => b.departure === today && effStatus(b) !== 'hold');
    const inHouse = bookings.filter(b => b.arrival <= today && b.departure > today && effStatus(b) !== 'hold');
    const upcoming = bookings
      .filter(b => b.arrival > today && effStatus(b) !== 'hold')
      .sort((a, b) => a.arrival.localeCompare(b.arrival))
      .slice(0, 5);
    const totalRevenue = bookings.filter(b => effStatus(b) !== 'hold').reduce((s, b) => s + b.totalAmount, 0);
    const myBookings = bookings.filter(b => b.createdBy === currentUser.name);
    const myRevenue = myBookings.filter(b => effStatus(b) !== 'hold').reduce((s, b) => s + b.totalAmount, 0);
    const activeHolds = bookings
      .filter(b => effStatus(b) === 'hold' && b.departure > today)
      .sort((a, b) => (a.holdExpiresAt ?? '').localeCompare(b.holdExpiresAt ?? ''));
    const holdValue = activeHolds.reduce((s, b) => s + b.totalAmount, 0);
    const pendingVerification = bookings.filter(b => effStatus(b) === 'pending_verification');
    const unverifiedPayments = payments.filter(p => !p.verified);
    const unverifiedAmount = unverifiedPayments.reduce((s, p) => s + p.amount, 0);
    const btcOpen = bookings.filter(b => b.finalBill?.isBTC && pStats(b).balance > 0);
    const btcOpenAmount = btcOpen.reduce((s, b) => s + pStats(b).balance, 0);

    // MTD
    const monthStart = today.slice(0, 7);
    const verifiedThisMonth = payments.filter(p => p.verified && (p.paymentDate ?? '').slice(0, 7) === monthStart);
    const collectedThisMonth = verifiedThisMonth.reduce((s, p) => s + p.amount, 0);
    const advanceThisMonth = payments.filter(p => p.verified && p.type === 'advance' && (p.paymentDate ?? '').slice(0, 7) === monthStart).reduce((s, p) => s + p.amount, 0);
    const monthBookings = bookings.filter(b => (b.departure ?? '').slice(0, 7) === monthStart && effStatus(b) !== 'hold');
    const expectedRevenueThisMonth = monthBookings.reduce((s, b) => s + pStats(b).billAmount, 0);
    const billedBookings = monthBookings.filter(b => !!b.finalBill && (b.departure ?? '') <= today);
    const actualRevenueThisMonth = billedBookings.reduce((s, b) => s + Number(b.finalBill?.totalAmount ?? 0), 0);
    const moneyReceivedThisMonth = collectedThisMonth;
    const resortReceivedThisMonth = payments.filter(p => p.verified && (p.paymentDate ?? '').slice(0, 7) === monthStart && p.recordedByRole === 'Front Office').reduce((s, p) => s + p.amount, 0);
    const resortByMode: Record<string, number> = {};
    payments.filter(p => p.verified && (p.paymentDate ?? '').slice(0, 7) === monthStart && p.recordedByRole === 'Front Office').forEach(p => { resortByMode[p.mode] = (resortByMode[p.mode] ?? 0) + p.amount; });
    let roomNightsThisMonth = 0;
    bookings.filter(b => effStatus(b) !== 'hold' || b.bookingType === 'corporate').forEach(b => {
      const rng = datesInRange(b.arrival, b.departure);
      roomNightsThisMonth += rng.filter(d => d.slice(0, 7) === monthStart).length * (b.rooms?.length ?? 0);
    });
    const expectedAtResortThisMonth = monthBookings.reduce((s, b) => s + Math.max(0, pStats(b).balance), 0);

    // Hospitality KPIs
    const daysInMonth = new Date(parseInt(monthStart.slice(0, 4)), parseInt(monthStart.slice(5, 7)), 0).getDate();
    const totalAvailableRoomNights = TOTAL_ROOMS * daysInMonth;
    const occupancyRate = totalAvailableRoomNights > 0 ? (roomNightsThisMonth / totalAvailableRoomNights) * 100 : 0;
    const adr = roomNightsThisMonth > 0 ? expectedRevenueThisMonth / roomNightsThisMonth : 0;
    const revpar = adr * (occupancyRate / 100);

    return { arrivingToday, departingToday, inHouse, upcoming, totalRevenue, myBookings, myRevenue, activeHolds, holdValue, pendingVerification, unverifiedPayments, unverifiedAmount, btcOpen, btcOpenAmount, collectedThisMonth, advanceThisMonth, expectedRevenueThisMonth, actualRevenueThisMonth, moneyReceivedThisMonth, resortReceivedThisMonth, resortByMode, roomNightsThisMonth, expectedAtResortThisMonth, occupancyRate, adr, revpar };
  }, [bookings, payments, today, currentUser.name, effStatus, pStats]);

  const agentStats = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    bookings.forEach(b => {
      if (!b.createdBy) return;
      if (!map[b.createdBy]) map[b.createdBy] = { count: 0, revenue: 0 };
      map[b.createdBy]!.count++;
      map[b.createdBy]!.revenue += b.totalAmount ?? 0;
    });
    return Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [bookings]);

  const subtitle = ROLE_SUBTITLE[role] ?? 'Welcome to the portal';
  const showMTD = isSales || isAccounts || isAdmin;

  return (
    <div>
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
            Welcome back, {currentUser.name}
          </h2>
          <p className="text-sm text-stone-500 italic">{subtitle}</p>
        </div>
        {(isSales || isAdmin) && (
          <div className="flex gap-2">
            <button onClick={() => setShowBlock(true)} className="bg-white border-2 border-amber-600 text-amber-700 hover:bg-amber-50 px-4 py-2.5 text-sm tracking-wider flex items-center gap-2 transition">
              <Calendar size={16} /> BLOCK ROOMS
            </button>
            <button onClick={() => setShowNewBooking(true)} className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 text-sm tracking-wider flex items-center gap-2 transition">
              <Plus size={16} /> NEW BOOKING
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      {isAccounts && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <KPICard label="Payments to Verify" value={stats.unverifiedPayments.length} sub={`₹${stats.unverifiedAmount.toLocaleString('en-IN')}`} accent={stats.unverifiedPayments.length > 0} />
          <KPICard label="BTC Outstanding" value={stats.btcOpen.length} sub={`₹${stats.btcOpenAmount.toLocaleString('en-IN')}`} accent={stats.btcOpenAmount > 0} />
          <KPICard label="Collected This Month" value={`₹${(stats.collectedThisMonth / 100000).toFixed(2)}L`} sub="verified receipts" />
          <KPICard label="Total Revenue (FY)" value={`₹${(stats.totalRevenue / 100000).toFixed(1)}L`} sub={`${bookings.length} bookings`} />
        </div>
      )}
      {(isFO || isOp) && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <KPICard label="In House Today" value={stats.inHouse.length} sub={`${stats.inHouse.reduce((s, b) => s + (b.rooms?.length ?? 0), 0)} rooms`} />
          <KPICard label="Arriving Today" value={stats.arrivingToday.length} sub="check-ins" />
          <KPICard label="Departing Today" value={stats.departingToday.length} sub="check-outs" accent={stats.departingToday.length > 0} />
          <KPICard label="Total Guests" value={stats.inHouse.reduce((s, b) => s + b.adults + b.children, 0)} sub="in-house right now" />
        </div>
      )}
      {(isSales || isAdmin) && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          <KPICard label="In House Today" value={stats.inHouse.length} sub={`${stats.inHouse.reduce((s, b) => s + (b.rooms?.length ?? 0), 0)} rooms`} />
          <KPICard label="Arriving Today" value={stats.arrivingToday.length} sub="check-ins" />
          <KPICard label="Active Holds" value={stats.activeHolds.length} sub={`₹${stats.holdValue.toLocaleString('en-IN')} pending`} accent={stats.activeHolds.length > 0} />
          <KPICard label={isSales ? 'My Bookings' : 'Total Bookings'} value={isSales ? stats.myBookings.length : bookings.length} sub={`₹${(isSales ? stats.myRevenue : stats.totalRevenue).toLocaleString('en-IN')}`} />
          <KPICard label="Total Revenue" value={`₹${(stats.totalRevenue / 100000).toFixed(1)}L`} sub="all bookings" />
        </div>
      )}

      {/* MTD Panel */}
      {showMTD && (
        <div className="bg-white border border-stone-300 mb-6">
          <div className="px-5 py-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
            <div>
              <h3 className="text-sm uppercase tracking-wider text-emerald-900 font-medium">
                Month to Date · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h3>
              <p className="text-xs text-stone-500 italic">Revenue, receipts and occupancy for the current month</p>
            </div>
            <div className="text-xs text-stone-500">As of {fmtDate(today)}</div>
          </div>
          <div className="grid grid-cols-4 gap-px bg-stone-200">
            <MTDCell label="Advance Received" value={`₹${stats.advanceThisMonth.toLocaleString('en-IN')}`} sub="verified advances this month" tone="advance" />
            <MTDCell label="Expected Revenue" value={`₹${stats.expectedRevenueThisMonth.toLocaleString('en-IN')}`} sub="bookings departing this month" tone="expected" />
            <MTDCell label="Actual Revenue till date" value={`₹${stats.actualRevenueThisMonth.toLocaleString('en-IN')}`} sub="invoices issued so far" tone="actual" />
            <MTDCell label="Actual Money Received" value={`₹${stats.moneyReceivedThisMonth.toLocaleString('en-IN')}`} sub="all verified receipts this month" tone="received" />
            <MTDCell label="Received at Resort" value={`₹${stats.resortReceivedThisMonth.toLocaleString('en-IN')}`} sub="collected by Front Office" tone="resort" />
            <MTDCell label="Expected at Resort" value={`₹${stats.expectedAtResortThisMonth.toLocaleString('en-IN')}`} sub="bill minus advance, still to collect" tone="expected_resort" />
            <MTDCell label="Room-Nights Blocked" value={stats.roomNightsThisMonth} sub="total room-nights this month" tone="rooms" />
            <MTDCell label="Collection Gap" value={`₹${Math.max(0, stats.expectedRevenueThisMonth - stats.moneyReceivedThisMonth).toLocaleString('en-IN')}`} sub="expected minus received" tone={stats.expectedRevenueThisMonth - stats.moneyReceivedThisMonth > 0 ? 'alert' : 'ok'} />
            <MTDCell label="Occupancy Rate" value={`${stats.occupancyRate.toFixed(1)}%`} sub={`${TOTAL_ROOMS} rooms available`} tone="advance" />
            <MTDCell label="ADR (Avg Daily Rate)" value={`₹${Math.round(stats.adr).toLocaleString('en-IN')}`} sub="revenue per room-night sold" tone="expected" />
            <MTDCell label="RevPAR" value={`₹${Math.round(stats.revpar).toLocaleString('en-IN')}`} sub="revenue per available room" tone="actual" />
          </div>
          {stats.resortReceivedThisMonth > 0 && (
            <div className="px-5 py-3 border-t border-stone-200 bg-blue-50/40">
              <div className="text-xs uppercase tracking-wider text-blue-900 mb-2 font-medium">Front Office collection breakdown</div>
              <div className="flex flex-wrap gap-4">
                {Object.entries(stats.resortByMode).sort((a, b) => b[1] - a[1]).map(([mode, amt]) => (
                  <div key={mode} className="text-xs">
                    <span className="text-stone-600">{mode}:</span>{' '}
                    <span className="font-medium text-blue-900">₹{amt.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending Verification */}
      {stats.pendingVerification.length > 0 && (
        <div className="bg-purple-50 border-2 border-purple-300 p-5 mb-6">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-purple-200">
            <h3 className="text-sm uppercase tracking-wider text-purple-900 font-medium flex items-center gap-2">
              <ShieldCheck size={14} /> Bookings Awaiting Payment Verification
            </h3>
            <span className="text-xs text-purple-700">Sales has logged advance — Accounts to verify against bank statement</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-purple-800 uppercase">
                <th className="text-left pb-2">Guest</th>
                <th className="text-left pb-2">Stay</th>
                <th className="text-left pb-2">Agent</th>
                <th className="text-right pb-2">Total</th>
                <th className="text-right pb-2">Advance Logged</th>
              </tr>
            </thead>
            <tbody>
              {stats.pendingVerification.map(b => {
                const ps = pStats(b);
                return (
                  <tr key={b.id} className="border-t border-purple-200">
                    <td className="py-2 font-medium">{b.guestName}</td>
                    <td className="py-2 text-xs">{fmtDate(b.arrival)} ({b.nights}n)</td>
                    <td className="py-2 text-xs text-stone-600">{b.createdBy}</td>
                    <td className="py-2 text-right">₹{b.totalAmount.toLocaleString('en-IN')}</td>
                    <td className="py-2 text-right font-medium text-purple-800">₹{ps.totalUnverified.toLocaleString('en-IN')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* BTC Receivables */}
      {(isAccounts || isAdmin) && stats.btcOpen.length > 0 && (
        <div className="bg-white border-2 border-purple-700 p-5 mb-6">
          <h3 className="text-sm uppercase tracking-wider text-purple-900 font-medium border-b border-purple-200 pb-2 mb-3 flex items-center gap-2">
            <Building2 size={14} /> BTC Receivables — Awaiting Corporate Payment
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-purple-800 uppercase">
                <th className="text-left pb-2">Bill #</th>
                <th className="text-left pb-2">Guest / Company</th>
                <th className="text-left pb-2">Checkout</th>
                <th className="text-left pb-2">Days Outstanding</th>
                <th className="text-right pb-2">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {stats.btcOpen.map(b => {
                const daysOut = Math.floor((new Date().getTime() - new Date(b.departure).getTime()) / 86400000);
                const ps = pStats(b);
                return (
                  <tr key={b.id} className="border-t border-purple-100">
                    <td className="py-2 font-mono text-xs">{b.finalBill?.billNumber ?? '—'}</td>
                    <td className="py-2">
                      <div className="font-medium">{b.guestName}</div>
                      {b.companyName && <div className="text-xs text-purple-700">{b.companyName}</div>}
                    </td>
                    <td className="py-2 text-xs">{fmtDate(b.departure)}</td>
                    <td className={`py-2 text-xs ${daysOut > 30 ? 'text-red-700 font-medium' : daysOut > 15 ? 'text-amber-700' : 'text-stone-600'}`}>
                      {daysOut} days
                    </td>
                    <td className="py-2 text-right font-medium">₹{ps.balance.toLocaleString('en-IN')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Active Holds */}
      {(isSales || isAdmin) && stats.activeHolds.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 p-5 mb-6">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-amber-200">
            <h3 className="text-sm uppercase tracking-wider text-amber-900 font-medium">Active Holds — Awaiting Payment</h3>
            <span className="text-xs text-amber-700">Follow up before expiry to secure these bookings</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-amber-800 uppercase">
                <th className="text-left pb-2">Guest</th>
                <th className="text-left pb-2">Contact</th>
                <th className="text-left pb-2">Stay</th>
                <th className="text-left pb-2">Rooms</th>
                <th className="text-left pb-2">Hold Expires</th>
                <th className="text-left pb-2">Agent</th>
                <th className="text-right pb-2">Amount</th>
                <th className="text-right pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {stats.activeHolds.map(b => {
                const expired = b.holdExpiresAt && new Date(b.holdExpiresAt) < new Date();
                return (
                  <tr key={b.id} className="border-t border-amber-200">
                    <td className="py-2 font-medium">{b.guestName}</td>
                    <td className="py-2 text-stone-600 text-xs">{b.contactNumber}</td>
                    <td className="py-2 text-xs">{fmtDate(b.arrival)} ({b.nights}n)</td>
                    <td className="py-2 text-xs">{b.rooms?.length}</td>
                    <td className={`py-2 text-xs ${expired ? 'text-red-700 font-medium' : 'text-stone-700'}`}>
                      {b.holdExpiresAt ? (expired ? '⚠ Expired' : fmtRelative(b.holdExpiresAt)) : 'No expiry set'}
                    </td>
                    <td className="py-2 text-xs text-stone-600">{b.createdBy}</td>
                    <td className="py-2 text-right font-medium">₹{b.totalAmount.toLocaleString('en-IN')}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => setPaymentFor(b)} className="text-xs bg-emerald-700 text-white px-3 py-1 hover:bg-emerald-800">+ ADVANCE</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Departing Today */}
      {(isFO || isAdmin || isOp) && stats.departingToday.length > 0 && (
        <div className="bg-blue-50 border-2 border-blue-300 p-5 mb-6">
          <h3 className="text-sm uppercase tracking-wider text-blue-900 font-medium border-b border-blue-200 pb-2 mb-3">Departing Today</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-blue-800 uppercase">
                <th className="text-left pb-2">Guest</th>
                <th className="text-left pb-2">Rooms</th>
                <th className="text-left pb-2">Stay</th>
                <th className="text-right pb-2">Estimated</th>
                <th className="text-right pb-2">Advance Recvd</th>
                {(isFO || isAdmin) && <th className="text-right pb-2">Action</th>}
              </tr>
            </thead>
            <tbody>
              {stats.departingToday.map(b => {
                const ps = pStats(b);
                return (
                  <tr key={b.id} className="border-t border-blue-200">
                    <td className="py-2 font-medium">{b.guestName}</td>
                    <td className="py-2 text-xs">{b.rooms?.length}</td>
                    <td className="py-2 text-xs">{fmtDate(b.arrival)} → {fmtDate(b.departure)}</td>
                    <td className="py-2 text-right text-xs">₹{b.totalAmount.toLocaleString('en-IN')}</td>
                    <td className="py-2 text-right text-xs text-emerald-700 font-medium">₹{ps.totalPaid.toLocaleString('en-IN')}</td>
                    {(isFO || isAdmin) && (
                      <td className="py-2 text-right">
                        <button onClick={() => setFinalBillFor(b)} className="text-xs bg-blue-700 text-white px-3 py-1 hover:bg-blue-800">RECORD BILL</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom grid */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-white border border-stone-200 p-5">
          <h3 className="text-sm uppercase tracking-wider text-stone-600 border-b border-stone-200 pb-2 mb-3">Arriving Today</h3>
          {stats.arrivingToday.length === 0 ? (
            <p className="text-sm text-stone-400 italic">No arrivals today</p>
          ) : (
            <ul className="space-y-2">
              {stats.arrivingToday.map(b => (
                <li key={b.id} className="text-sm flex justify-between border-b border-stone-100 py-2">
                  <span className="font-medium">{b.guestName}</span>
                  <span className="text-stone-500">{b.rooms?.length} rooms · {b.adults}A/{b.children}C</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {(isSales || isAdmin) ? (
          <div className="bg-white border border-stone-200 p-5">
            <h3 className="text-sm uppercase tracking-wider text-stone-600 border-b border-stone-200 pb-2 mb-3">Sales Team Performance</h3>
            {agentStats.length === 0 ? (
              <p className="text-sm text-stone-400 italic">No bookings logged yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-stone-500 uppercase">
                    <th className="text-left pb-2">Agent</th>
                    <th className="text-right pb-2">Bookings</th>
                    <th className="text-right pb-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {agentStats.map(([agent, s]) => (
                    <tr key={agent} className="border-t border-stone-100">
                      <td className="py-2">{agent}</td>
                      <td className="text-right py-2">{s.count}</td>
                      <td className="text-right py-2 font-medium">₹{s.revenue.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : isFO ? (
          <div className="bg-white border border-stone-200 p-5">
            <h3 className="text-sm uppercase tracking-wider text-stone-600 border-b border-stone-200 pb-2 mb-3">Currently In-House</h3>
            {stats.inHouse.length === 0 ? (
              <p className="text-sm text-stone-400 italic">No guests in-house</p>
            ) : (
              <ul className="space-y-2">
                {stats.inHouse.map(b => (
                  <li key={b.id} className="text-sm flex justify-between border-b border-stone-100 py-2">
                    <span className="font-medium">{b.guestName}</span>
                    <button onClick={() => setFinalBillFor(b)} className="text-xs text-blue-700 hover:underline">Record bill</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {/* Upcoming arrivals */}
      {stats.upcoming.length > 0 && (
        <div className="bg-white border border-stone-200 p-5">
          <h3 className="text-sm uppercase tracking-wider text-stone-600 border-b border-stone-200 pb-2 mb-3">Next Arrivals</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-stone-500 uppercase">
                <th className="text-left pb-2">Arrival</th>
                <th className="text-left pb-2">Guest</th>
                <th className="text-left pb-2">Rooms</th>
                <th className="text-left pb-2">Nights</th>
                <th className="text-left pb-2">Agent</th>
                <th className="text-right pb-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {stats.upcoming.map(b => (
                <tr key={b.id} className="border-t border-stone-100">
                  <td className="py-2">{fmtDate(b.arrival)}</td>
                  <td className="py-2 font-medium">{b.guestName}</td>
                  <td className="py-2 text-xs">{b.rooms?.length}</td>
                  <td className="py-2 text-xs">{b.nights}</td>
                  <td className="py-2 text-xs text-stone-500">{b.createdBy}</td>
                  <td className="py-2 text-right font-medium">₹{b.totalAmount.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showNewBooking && (
        <BookingModal
          users={users}
          currentUser={currentUser}
          existingBookings={bookings}
          onClose={() => setShowNewBooking(false)}
        />
      )}
      {showBlock && (
        <BlockModal
          currentUser={currentUser}
          existingBookings={bookings}
          onClose={() => setShowBlock(false)}
        />
      )}
      {paymentFor && (
        <PaymentModal
          booking={paymentFor}
          currentUser={currentUser}
          payments={payments.filter(p => p.bookingId === paymentFor.id)}
          onClose={() => setPaymentFor(null)}
        />
      )}
      {finalBillFor && (
        <FinalBillModal
          booking={finalBillFor}
          currentUser={currentUser}
          payments={payments.filter(p => p.bookingId === finalBillFor.id)}
          onClose={() => setFinalBillFor(null)}
        />
      )}
    </div>
  );
}

// ---------- Small helpers ----------

function KPICard({ label, value, sub, accent = false }: { label: string; value: string | number; sub: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-stone-200 p-4">
      <div className="text-xs text-stone-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl mt-2 ${accent ? 'text-amber-700' : 'text-emerald-900'}`} style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>{value}</div>
      <div className="text-xs text-stone-400 mt-1 italic">{sub}</div>
    </div>
  );
}

const MTD_TONES: Record<string, string> = {
  advance: 'text-emerald-800',
  expected: 'text-blue-800',
  actual: 'text-emerald-900',
  received: 'text-emerald-700',
  resort: 'text-blue-700',
  expected_resort: 'text-blue-800',
  rooms: 'text-stone-700',
  alert: 'text-red-700',
  ok: 'text-emerald-700',
};

function MTDCell({ label, value, sub, tone }: { label: string; value: string | number; sub: string; tone: string }) {
  return (
    <div className="bg-white p-4">
      <div className="text-xs text-stone-500 uppercase tracking-wider leading-tight">{label}</div>
      <div className={`text-xl mt-2 font-semibold ${MTD_TONES[tone] ?? 'text-stone-800'}`} style={{ fontFamily: "'Cormorant Garamond', serif" }}>{value}</div>
      <div className="text-xs text-stone-400 mt-1 italic leading-tight">{sub}</div>
    </div>
  );
}
