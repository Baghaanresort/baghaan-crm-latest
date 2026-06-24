'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { sendVoucherAndConfirm, extendHold } from '@/lib/actions/enquiries';
import {
  Plus, Calendar, Building2,
  BedDouble, Users, TrendingUp, Clock, CreditCard,
  ArrowUpRight, ArrowDownRight, Home, CheckCircle2,
  AlertCircle, DollarSign, BarChart3, Percent, Send, FileText
} from 'lucide-react';
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
const EnquiryModal = dynamic(() => import('@/components/enquiries/EnquiryModal').then(m => ({ default: m.EnquiryModal })), { ssr: false });

interface Props {
  bookings: Booking[];
  payments: Payment[];
  users: Array<{ name: string; role: string }>;
  currentUser: { id: string; name: string; role: UserRole };
  today: string;
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatAmount(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function DashboardClient({ bookings, payments, users, currentUser, today }: Props) {
  const role = currentUser.role;
  const isOp = OPERATIONAL_ROLES.includes(role);
  const isFO = role === 'Front Office';
  const isSales = role === 'Sales';
  const isAdmin = role === 'Admin';
  const isAccounts = role === 'Accounts';

  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showNewEnquiry, setShowNewEnquiry] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [paymentFor, setPaymentFor] = useState<Booking | null>(null);
  const [finalBillFor, setFinalBillFor] = useState<Booking | null>(null);
  const [isPending, startTransition] = useTransition();
  const [nowMs] = useState(() => Date.now()); // captured once; pure inside render/memo
  const router = useRouter();

  const pStats = useMemo(() => (b: Booking) => getBookingPaymentStatus(b, payments), [payments]);
  const effStatus = useMemo(() => (b: Booking) => getEffectiveStatus(b, payments), [payments]);

  const handleSendVoucher = (b: Booking) => {
    startTransition(async () => {
      const r = await sendVoucherAndConfirm(b.id);
      if (!r.success) { toast.error(r.error); return; }
      toast.success(`Voucher sent · booking confirmed · ${r.data.confirmationNumber}`);
      router.refresh();
    });
  };
  const handleExtend = (b: Booking, days: number) => {
    startTransition(async () => {
      const r = await extendHold(b.id, days);
      if (!r.success) { toast.error(r.error); return; }
      toast.success(`Hold extended by ${days} day${days > 1 ? 's' : ''}`);
      router.refresh();
    });
  };

  const stats = useMemo(() => {
    const arrivingToday = bookings.filter(b => b.arrival === today && effStatus(b) !== 'hold');
    const departingToday = bookings.filter(b => b.departure === today && effStatus(b) !== 'hold');
    const inHouse = bookings.filter(b => b.arrival <= today && b.departure > today && effStatus(b) !== 'hold');
    const upcoming = bookings.filter(b => b.arrival > today && effStatus(b) !== 'hold').sort((a, b) => a.arrival.localeCompare(b.arrival)).slice(0, 5);
    const totalRevenue = bookings.filter(b => effStatus(b) !== 'hold').reduce((s, b) => s + b.totalAmount, 0);
    const myBookings = bookings.filter(b => b.createdBy === currentUser.name);
    const myRevenue = myBookings.filter(b => effStatus(b) !== 'hold').reduce((s, b) => s + b.totalAmount, 0);
    const activeHolds = bookings.filter(b => effStatus(b) === 'hold' && b.departure > today).sort((a, b) => (a.holdExpiresAt ?? '').localeCompare(b.holdExpiresAt ?? ''));
    // Paid holds whose voucher hasn't gone out yet — "Advance Payment Received", awaiting the voucher.
    const vouchersToSend = bookings.filter(b => b.status === 'hold' && !b.voucherSent && pStats(b).totalPaid > 0)
      .sort((a, b) => (a.holdExpiresAt ?? '').localeCompare(b.holdExpiresAt ?? ''));
    // Unpaid holds within 24h of expiry (or already past) — nudge Sales to extend/follow up.
    const soonIso = new Date(nowMs + 24 * 3600000).toISOString();
    const holdsExpiringSoon = bookings.filter(b => b.status === 'hold' && pStats(b).totalPaid === 0 && !!b.holdExpiresAt && b.holdExpiresAt <= soonIso)
      .sort((a, b) => (a.holdExpiresAt ?? '').localeCompare(b.holdExpiresAt ?? ''));
    const holdValue = activeHolds.reduce((s, b) => s + b.totalAmount, 0);
    const btcOpen = bookings.filter(b => b.finalBill?.isBTC && pStats(b).balance > 0);
    const btcOpenAmount = btcOpen.reduce((s, b) => s + pStats(b).balance, 0);

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
    const daysInMonth = new Date(parseInt(monthStart.slice(0, 4)), parseInt(monthStart.slice(5, 7)), 0).getDate();
    const totalAvailableRoomNights = TOTAL_ROOMS * daysInMonth;
    const occupancyRate = totalAvailableRoomNights > 0 ? (roomNightsThisMonth / totalAvailableRoomNights) * 100 : 0;
    const adr = roomNightsThisMonth > 0 ? expectedRevenueThisMonth / roomNightsThisMonth : 0;
    const revpar = adr * (occupancyRate / 100);
    const collectionGap = Math.max(0, expectedRevenueThisMonth - moneyReceivedThisMonth);

    return { arrivingToday, departingToday, inHouse, upcoming, totalRevenue, myBookings, myRevenue, activeHolds, holdValue, vouchersToSend, holdsExpiringSoon, btcOpen, btcOpenAmount, collectedThisMonth, advanceThisMonth, expectedRevenueThisMonth, actualRevenueThisMonth, moneyReceivedThisMonth, resortReceivedThisMonth, resortByMode, roomNightsThisMonth, expectedAtResortThisMonth, occupancyRate, adr, revpar, collectionGap };
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

  const todayFormatted = fmtDate(today);
  const dayName = new Date(today).toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-3xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 700 }}>
              Welcome back, {currentUser.name}
            </h2>
          </div>
          <p className="text-sm text-stone-500 italic mb-1">{subtitle}</p>
          <div className="flex items-center gap-2 text-xs text-stone-400">
            <Calendar size={12} />
            <span>{dayName}, {todayFormatted}</span>
            {(isSales || isAdmin || isFO) && (
              <>
                <span className="text-stone-300">·</span>
                <span className="text-emerald-700 font-medium">{stats.arrivingToday.length} arriving</span>
                <span className="text-stone-300">·</span>
                <span className="text-blue-700 font-medium">{stats.departingToday.length} departing</span>
                <span className="text-stone-300">·</span>
                <span className="text-stone-600 font-medium">{stats.inHouse.length} in-house</span>
                {(isSales || isAdmin) && (
                  <>
                    <span className="text-stone-300">·</span>
                    <span className="text-amber-700 font-medium">{stats.occupancyRate.toFixed(0)}% occupancy</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        {(isSales || isAdmin) && (
          <div className="flex gap-2">
            <button onClick={() => setShowNewEnquiry(true)} className="border-2 border-emerald-800 text-emerald-800 hover:bg-emerald-50 px-4 py-2 text-sm tracking-wider flex items-center gap-2 transition rounded-lg font-medium">
              <Plus size={15} /> NEW ENQUIRY
            </button>
            <button onClick={() => setShowBlock(true)} className="border-2 border-amber-500 text-amber-700 hover:bg-amber-50 px-4 py-2 text-sm tracking-wider flex items-center gap-2 transition rounded-lg font-medium">
              <Calendar size={15} /> BLOCK ROOMS
            </button>
            <button onClick={() => setShowNewBooking(true)} className="bg-emerald-900 hover:bg-emerald-800 text-amber-100 px-5 py-2 text-sm tracking-wider flex items-center gap-2 transition rounded-lg font-medium shadow-sm">
              <Plus size={15} /> NEW BOOKING
            </button>
          </div>
        )}
      </div>

      {/* ── KPI Cards ── */}
      {isAccounts && (
        <div className="grid grid-cols-4 gap-4">
          <KPICard label="Advances This Month" value={formatAmount(stats.advanceThisMonth)} sub="deposits collected" icon={CreditCard} color="amber" />
          <KPICard label="BTC Outstanding" value={stats.btcOpen.length} sub={formatAmount(stats.btcOpenAmount)} icon={Building2} color="purple" accent={stats.btcOpenAmount > 0} />
          <KPICard label="Collected This Month" value={formatAmount(stats.collectedThisMonth)} sub="all receipts" icon={CreditCard} color="emerald" />
          <KPICard label="Total Revenue" value={formatAmount(stats.totalRevenue)} sub={`${bookings.length} bookings`} icon={TrendingUp} color="blue" />
        </div>
      )}
      {(isFO || isOp) && (
        <div className="grid grid-cols-4 gap-4">
          <KPICard label="In House" value={stats.inHouse.length} sub={`${stats.inHouse.reduce((s, b) => s + (b.rooms?.length ?? 0), 0)} rooms occupied`} icon={Home} color="emerald" />
          <KPICard label="Arriving Today" value={stats.arrivingToday.length} sub="check-ins expected" icon={ArrowDownRight} color="blue" />
          <KPICard label="Departing Today" value={stats.departingToday.length} sub="check-outs today" icon={ArrowUpRight} color="amber" accent={stats.departingToday.length > 0} />
          <KPICard label="Total Guests" value={stats.inHouse.reduce((s, b) => s + b.adults + b.children, 0)} sub="in-house right now" icon={Users} color="purple" />
        </div>
      )}
      {(isSales || isAdmin) && (
        <div className="grid grid-cols-5 gap-4">
          <KPICard label="In House" value={stats.inHouse.length} sub={`${stats.inHouse.reduce((s, b) => s + (b.rooms?.length ?? 0), 0)} rooms`} icon={BedDouble} color="emerald" />
          <KPICard label="Arriving Today" value={stats.arrivingToday.length} sub="check-ins" icon={ArrowDownRight} color="blue" />
          <KPICard label="Active Holds" value={stats.activeHolds.length} sub={formatAmount(stats.holdValue)} icon={Clock} color="amber" accent={stats.activeHolds.length > 0} />
          <KPICard label={isSales ? 'My Bookings' : 'Total Bookings'} value={isSales ? stats.myBookings.length : bookings.length} sub={formatAmount(isSales ? stats.myRevenue : stats.totalRevenue)} icon={CheckCircle2} color="purple" />
          <KPICard label="Total Revenue" value={formatAmount(stats.totalRevenue)} sub="all bookings" icon={TrendingUp} color="blue" />
        </div>
      )}

      {/* ── Alert Banners ── */}
      {(isAccounts || isAdmin) && stats.btcOpen.length > 0 && (
        <AlertSection color="indigo" icon={<Building2 size={15} />} title="BTC Receivables" badge={stats.btcOpen.length} subtitle="Corporate accounts awaiting payment">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-indigo-700 uppercase border-b border-indigo-100">
                <th className="text-left pb-2 pt-1">Guest / Company</th>
                <th className="text-left pb-2 pt-1">Bill #</th>
                <th className="text-left pb-2 pt-1">Checkout</th>
                <th className="text-left pb-2 pt-1">Overdue</th>
                <th className="text-right pb-2 pt-1">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {stats.btcOpen.map(b => {
                const daysOut = Math.floor((new Date().getTime() - new Date(b.departure).getTime()) / 86400000);
                const ps = pStats(b);
                return (
                  <tr key={b.id} className="border-b border-indigo-50 last:border-0">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={b.guestName} color="indigo" />
                        <div>
                          <div className="font-medium">{b.guestName}</div>
                          {b.companyName && <div className="text-xs text-indigo-600">{b.companyName}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 font-mono text-xs">{b.finalBill?.billNumber ?? '—'}</td>
                    <td className="py-2 text-xs">{fmtDate(b.departure)}</td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${daysOut > 30 ? 'bg-red-100 text-red-700' : daysOut > 15 ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600'}`}>
                        {daysOut}d
                      </span>
                    </td>
                    <td className="py-2 text-right font-semibold">₹{ps.balance.toLocaleString('en-IN')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AlertSection>
      )}

      {(isSales || isAdmin) && stats.vouchersToSend.length > 0 && (
        <AlertSection color="emerald" icon={<FileText size={15} />} title="Vouchers to Send" badge={stats.vouchersToSend.length} subtitle="Advance received — send the voucher to confirm the booking">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-emerald-800 uppercase border-b border-emerald-100">
                <th className="text-left pb-2 pt-1">Guest</th>
                <th className="text-left pb-2 pt-1">Stay</th>
                <th className="text-left pb-2 pt-1">Hold expires</th>
                <th className="text-left pb-2 pt-1">Agent</th>
                <th className="text-right pb-2 pt-1">Paid</th>
                <th className="text-right pb-2 pt-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {stats.vouchersToSend.map(b => {
                const ps = pStats(b);
                return (
                  <tr key={b.id} className="border-b border-emerald-50 last:border-0">
                    <td className="py-2"><div className="flex items-center gap-2"><Avatar name={b.guestName} color="emerald" /><div><div className="font-medium">{b.guestName}</div><div className="text-xs text-stone-500">{b.contactNumber}</div></div></div></td>
                    <td className="py-2 text-xs">{fmtDate(b.arrival)} · {b.nights}n</td>
                    <td className="py-2 text-xs text-stone-500">{b.holdExpiresAt ? fmtRelative(b.holdExpiresAt) : '—'}</td>
                    <td className="py-2 text-xs text-stone-500">{b.createdBy}</td>
                    <td className="py-2 text-right text-emerald-700 font-medium">₹{ps.totalPaid.toLocaleString('en-IN')}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => handleSendVoucher(b)} disabled={isPending} className="inline-flex items-center gap-1 text-xs bg-emerald-700 text-white px-3 py-1 hover:bg-emerald-800 rounded-md font-medium disabled:opacity-50"><Send size={11} /> Send Voucher</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AlertSection>
      )}

      {(isSales || isAdmin) && stats.holdsExpiringSoon.length > 0 && (
        <AlertSection color="red" icon={<Clock size={15} />} title="Holds Expiring Soon" badge={stats.holdsExpiringSoon.length} subtitle="Unpaid holds within 24h — extend or follow up before the rooms are released">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-red-700 uppercase border-b border-red-100">
                <th className="text-left pb-2 pt-1">Guest</th>
                <th className="text-left pb-2 pt-1">Stay</th>
                <th className="text-left pb-2 pt-1">Expires</th>
                <th className="text-left pb-2 pt-1">Agent</th>
                <th className="text-right pb-2 pt-1">Extend</th>
              </tr>
            </thead>
            <tbody>
              {stats.holdsExpiringSoon.map(b => {
                const expired = b.holdExpiresAt && new Date(b.holdExpiresAt) < new Date();
                return (
                  <tr key={b.id} className="border-b border-red-50 last:border-0">
                    <td className="py-2"><div className="flex items-center gap-2"><Avatar name={b.guestName} color="red" /><div><div className="font-medium">{b.guestName}</div><div className="text-xs text-stone-500">{b.contactNumber}</div></div></div></td>
                    <td className="py-2 text-xs">{fmtDate(b.arrival)} · {b.nights}n</td>
                    <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${expired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{b.holdExpiresAt ? (expired ? '⚠ Expired' : fmtRelative(b.holdExpiresAt)) : '—'}</span></td>
                    <td className="py-2 text-xs text-stone-500">{b.createdBy}</td>
                    <td className="py-2 text-right">
                      <div className="inline-flex gap-1">
                        <button onClick={() => handleExtend(b, 1)} disabled={isPending} className="text-xs border border-red-300 text-red-700 px-2 py-1 hover:bg-red-50 rounded-md disabled:opacity-50">+1d</button>
                        <button onClick={() => handleExtend(b, 2)} disabled={isPending} className="text-xs border border-red-300 text-red-700 px-2 py-1 hover:bg-red-50 rounded-md disabled:opacity-50">+2d</button>
                        <button onClick={() => handleExtend(b, 7)} disabled={isPending} className="text-xs border border-red-300 text-red-700 px-2 py-1 hover:bg-red-50 rounded-md disabled:opacity-50">+7d</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AlertSection>
      )}

      {(isSales || isAdmin) && stats.activeHolds.length > 0 && (
        <AlertSection color="amber" icon={<Clock size={15} />} title="Active Holds — Awaiting Advance" badge={stats.activeHolds.length} subtitle="Follow up before expiry to secure these bookings">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-amber-700 uppercase border-b border-amber-100">
                <th className="text-left pb-2 pt-1">Guest</th>
                <th className="text-left pb-2 pt-1">Stay</th>
                <th className="text-left pb-2 pt-1">Rooms</th>
                <th className="text-left pb-2 pt-1">Expires</th>
                <th className="text-left pb-2 pt-1">Agent</th>
                <th className="text-right pb-2 pt-1">Amount</th>
                <th className="text-right pb-2 pt-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {stats.activeHolds.map(b => {
                const expired = b.holdExpiresAt && new Date(b.holdExpiresAt) < new Date();
                return (
                  <tr key={b.id} className="border-b border-amber-50 last:border-0">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={b.guestName} color="amber" />
                        <div>
                          <div className="font-medium">{b.guestName}</div>
                          <div className="text-xs text-stone-500">{b.contactNumber}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 text-xs">{fmtDate(b.arrival)} · {b.nights}n</td>
                    <td className="py-2 text-xs">{b.rooms?.length}</td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${expired ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                        {b.holdExpiresAt ? (expired ? '⚠ Expired' : fmtRelative(b.holdExpiresAt)) : 'No expiry'}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-stone-500">{b.createdBy}</td>
                    <td className="py-2 text-right font-medium">₹{b.totalAmount.toLocaleString('en-IN')}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => setPaymentFor(b)} className="text-xs bg-emerald-700 text-white px-3 py-1 hover:bg-emerald-800 rounded-md font-medium">+ Advance</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AlertSection>
      )}

      {(isFO || isAdmin || isOp) && stats.departingToday.length > 0 && (
        <AlertSection color="blue" icon={<ArrowUpRight size={15} />} title="Departing Today" badge={stats.departingToday.length} subtitle="Record bills before guests check out">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-blue-700 uppercase border-b border-blue-100">
                <th className="text-left pb-2 pt-1">Guest</th>
                <th className="text-left pb-2 pt-1">Rooms</th>
                <th className="text-left pb-2 pt-1">Stay</th>
                <th className="text-right pb-2 pt-1">Total</th>
                <th className="text-right pb-2 pt-1">Paid</th>
                {(isFO || isAdmin) && <th className="text-right pb-2 pt-1">Action</th>}
              </tr>
            </thead>
            <tbody>
              {stats.departingToday.map(b => {
                const ps = pStats(b);
                return (
                  <tr key={b.id} className="border-b border-blue-50 last:border-0">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={b.guestName} color="blue" />
                        <span className="font-medium">{b.guestName}</span>
                      </div>
                    </td>
                    <td className="py-2 text-xs">{b.rooms?.length}</td>
                    <td className="py-2 text-xs">{fmtDate(b.arrival)} → {fmtDate(b.departure)}</td>
                    <td className="py-2 text-right text-xs">₹{b.totalAmount.toLocaleString('en-IN')}</td>
                    <td className="py-2 text-right text-xs text-emerald-700 font-medium">₹{ps.totalPaid.toLocaleString('en-IN')}</td>
                    {(isFO || isAdmin) && (
                      <td className="py-2 text-right">
                        <button onClick={() => setFinalBillFor(b)} className="text-xs bg-blue-700 text-white px-3 py-1 hover:bg-blue-800 rounded-md font-medium">Record Bill</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AlertSection>
      )}

      {/* ── MTD Panel ── */}
      {showMTD && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/60">
            <div>
              <h3 className="text-sm font-semibold text-emerald-900 uppercase tracking-wider">
                Month to Date · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h3>
              <p className="text-xs text-stone-400 mt-0.5">Revenue, receipts and occupancy for the current month</p>
            </div>
            <span className="text-xs text-stone-400 bg-stone-100 px-3 py-1 rounded-full">As of {fmtDate(today)}</span>
          </div>

          {/* Revenue Group */}
          <div className="px-6 pt-4 pb-2">
            <div className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <DollarSign size={11} /> Revenue
            </div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <MTDCard label="Expected Revenue" value={`₹${stats.expectedRevenueThisMonth.toLocaleString('en-IN')}`} sub="bookings departing this month" tone="blue" />
              <MTDCard label="Actual Revenue" value={`₹${stats.actualRevenueThisMonth.toLocaleString('en-IN')}`} sub="invoices issued so far" tone="emerald" />
              <MTDCard label="Advance Received" value={`₹${stats.advanceThisMonth.toLocaleString('en-IN')}`} sub="verified advances" tone="emerald" />
              <MTDCard label="Collection Gap" value={`₹${stats.collectionGap.toLocaleString('en-IN')}`} sub="expected minus received" tone={stats.collectionGap > 0 ? 'red' : 'emerald'} />
            </div>
          </div>

          <div className="border-t border-stone-100 mx-6" />

          {/* Collections Group */}
          <div className="px-6 pt-4 pb-2">
            <div className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <CreditCard size={11} /> Collections
            </div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <MTDCard label="Total Collected" value={`₹${stats.moneyReceivedThisMonth.toLocaleString('en-IN')}`} sub="all verified receipts" tone="emerald" />
              <MTDCard label="Received at Resort" value={`₹${stats.resortReceivedThisMonth.toLocaleString('en-IN')}`} sub="collected by Front Office" tone="blue" />
              <MTDCard label="Expected at Resort" value={`₹${stats.expectedAtResortThisMonth.toLocaleString('en-IN')}`} sub="balance still to collect" tone="amber" />
              <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                <div className="text-xs text-stone-500 uppercase tracking-wider mb-2">By Mode</div>
                {Object.keys(stats.resortByMode).length === 0 ? (
                  <div className="text-xs text-stone-400 italic">No collections yet</div>
                ) : (
                  Object.entries(stats.resortByMode).sort((a, b) => b[1] - a[1]).map(([mode, amt]) => (
                    <div key={mode} className="flex justify-between text-xs py-0.5">
                      <span className="text-stone-500">{mode}</span>
                      <span className="font-medium text-stone-700">₹{amt.toLocaleString('en-IN')}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-stone-100 mx-6" />

          {/* Occupancy Group */}
          <div className="px-6 pt-4 pb-5">
            <div className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Percent size={11} /> Occupancy & Performance
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-stone-50 rounded-lg p-4 border border-stone-100">
                <div className="text-xs text-stone-500 uppercase tracking-wider mb-2">Occupancy Rate</div>
                <div className="text-2xl font-bold text-emerald-800" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{stats.occupancyRate.toFixed(1)}%</div>
                <div className="mt-2 h-2 bg-stone-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${stats.occupancyRate >= 70 ? 'bg-emerald-500' : stats.occupancyRate >= 40 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${Math.min(100, stats.occupancyRate)}%` }} />
                </div>
                <div className="text-xs text-stone-400 mt-1">{stats.roomNightsThisMonth} of {TOTAL_ROOMS * new Date(parseInt(today.slice(0,4)), parseInt(today.slice(5,7)), 0).getDate()} room-nights</div>
              </div>
              <MTDCard label="ADR (Avg Daily Rate)" value={`₹${Math.round(stats.adr).toLocaleString('en-IN')}`} sub="revenue per room-night sold" tone="blue" />
              <MTDCard label="RevPAR" value={`₹${Math.round(stats.revpar).toLocaleString('en-IN')}`} sub="revenue per available room" tone="emerald" />
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom Grid ── */}
      <div className="grid grid-cols-2 gap-6">
        {/* Arriving Today */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wider flex items-center gap-2">
              <ArrowDownRight size={14} className="text-emerald-600" /> Arriving Today
            </h3>
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{stats.arrivingToday.length}</span>
          </div>
          {stats.arrivingToday.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 size={24} className="text-stone-300 mx-auto mb-2" />
              <p className="text-sm text-stone-400 italic">No arrivals today</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.arrivingToday.map(b => (
                <div key={b.id} className="flex items-center justify-between py-2 border-b border-stone-50 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={b.guestName} color="emerald" />
                    <div>
                      <div className="text-sm font-medium">{b.guestName}</div>
                      <div className="text-xs text-stone-400">{b.nights}n · {b.rooms?.length} rooms</div>
                    </div>
                  </div>
                  <div className="text-xs text-stone-500">{b.adults}A/{b.children}C</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Agent Performance or In-House */}
        {(isSales || isAdmin) ? (
          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wider flex items-center gap-2">
                <BarChart3 size={14} className="text-emerald-600" /> Sales Performance
              </h3>
            </div>
            {agentStats.length === 0 ? (
              <div className="text-center py-6">
                <TrendingUp size={24} className="text-stone-300 mx-auto mb-2" />
                <p className="text-sm text-stone-400 italic">No bookings logged yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {agentStats.map(([agent, s], i) => {
                  const maxRevenue = agentStats[0]?.[1].revenue ?? 1;
                  const pct = (s.revenue / maxRevenue) * 100;
                  return (
                    <div key={agent}>
                      <div className="flex justify-between text-sm mb-1">
                        <div className="flex items-center gap-2">
                          <Avatar name={agent} color={i === 0 ? 'amber' : 'stone'} />
                          <span className="font-medium">{agent}</span>
                          {i === 0 && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Top</span>}
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-emerald-800">₹{(s.revenue / 100000).toFixed(1)}L</div>
                          <div className="text-xs text-stone-400">{s.count} bookings</div>
                        </div>
                      </div>
                      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : isFO ? (
          <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wider flex items-center gap-2">
                <Home size={14} className="text-emerald-600" /> Currently In-House
              </h3>
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{stats.inHouse.length}</span>
            </div>
            {stats.inHouse.length === 0 ? (
              <div className="text-center py-6">
                <BedDouble size={24} className="text-stone-300 mx-auto mb-2" />
                <p className="text-sm text-stone-400 italic">No guests in-house</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.inHouse.map(b => (
                  <div key={b.id} className="flex items-center justify-between py-2 border-b border-stone-50 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={b.guestName} color="blue" />
                      <div>
                        <div className="text-sm font-medium">{b.guestName}</div>
                        <div className="text-xs text-stone-400">Until {fmtDate(b.departure)}</div>
                      </div>
                    </div>
                    <button onClick={() => setFinalBillFor(b)} className="text-xs text-blue-700 border border-blue-200 px-2 py-1 hover:bg-blue-50 rounded-md">Bill</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* ── Upcoming Arrivals ── */}
      {stats.upcoming.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Calendar size={14} className="text-emerald-600" /> Next Arrivals
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-stone-400 uppercase border-b border-stone-100">
                <th className="text-left pb-2">Guest</th>
                <th className="text-left pb-2">Arrival</th>
                <th className="text-left pb-2">Rooms</th>
                <th className="text-left pb-2">Nights</th>
                <th className="text-left pb-2">Agent</th>
                <th className="text-right pb-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {stats.upcoming.map(b => (
                <tr key={b.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/50">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <Avatar name={b.guestName} color="stone" />
                      <span className="font-medium">{b.guestName}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-xs text-stone-600">{fmtDate(b.arrival)}</td>
                  <td className="py-2.5 text-xs text-stone-600">{b.rooms?.length}</td>
                  <td className="py-2.5 text-xs text-stone-600">{b.nights}</td>
                  <td className="py-2.5 text-xs text-stone-400">{b.createdBy}</td>
                  <td className="py-2.5 text-right font-semibold text-emerald-800">₹{b.totalAmount.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showNewBooking && <BookingModal users={users} currentUser={currentUser} existingBookings={bookings} onClose={() => setShowNewBooking(false)} />}
      {showNewEnquiry && <EnquiryModal users={users} currentUser={currentUser} onClose={() => setShowNewEnquiry(false)} />}
      {showBlock && <BlockModal currentUser={currentUser} existingBookings={bookings} onClose={() => setShowBlock(false)} />}
      {paymentFor && <PaymentModal booking={paymentFor} currentUser={currentUser} payments={payments.filter(p => p.bookingId === paymentFor.id)} onClose={() => setPaymentFor(null)} />}
      {finalBillFor && <FinalBillModal booking={finalBillFor} currentUser={currentUser} payments={payments.filter(p => p.bookingId === finalBillFor.id)} onClose={() => setFinalBillFor(null)} />}
    </div>
  );
}

// ── KPI Card ──
const KPI_COLORS: Record<string, { bg: string; icon: string; border: string; text: string }> = {
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-l-emerald-500', text: 'text-emerald-900' },
  blue: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-l-blue-500', text: 'text-blue-900' },
  amber: { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-l-amber-500', text: 'text-amber-900' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', border: 'border-l-purple-500', text: 'text-purple-900' },
  red: { bg: 'bg-red-50', icon: 'text-red-600', border: 'border-l-red-500', text: 'text-red-900' },
};

function KPICard({ label, value, sub, icon: Icon, color, accent = false }: {
  label: string; value: string | number; sub: string;
  icon: React.ElementType; color: string; accent?: boolean;
}) {
  const c = KPI_COLORS[accent ? color : color] ?? KPI_COLORS['emerald']!;
  return (
    <div className={`bg-white rounded-xl border border-stone-200 border-l-4 ${c.border} shadow-sm p-4 hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <div className="text-xs text-stone-500 uppercase tracking-wider leading-tight">{label}</div>
        <div className={`p-1.5 rounded-lg ${c.bg}`}>
          <Icon size={14} className={c.icon} />
        </div>
      </div>
      <div className={`text-2xl mt-2 font-bold ${c.text}`} style={{ fontFamily: "'Cormorant Garamond', serif" }}>{value}</div>
      <div className="text-xs text-stone-400 mt-1">{sub}</div>
    </div>
  );
}

// ── Alert Section ──
const ALERT_COLORS: Record<string, { bg: string; border: string; title: string; badge: string }> = {
  purple: { bg: 'bg-purple-50/50', border: 'border-l-purple-500', title: 'text-purple-900', badge: 'bg-purple-100 text-purple-700' },
  amber: { bg: 'bg-amber-50/50', border: 'border-l-amber-500', title: 'text-amber-900', badge: 'bg-amber-100 text-amber-700' },
  blue: { bg: 'bg-blue-50/50', border: 'border-l-blue-500', title: 'text-blue-900', badge: 'bg-blue-100 text-blue-700' },
  indigo: { bg: 'bg-indigo-50/50', border: 'border-l-indigo-500', title: 'text-indigo-900', badge: 'bg-indigo-100 text-indigo-700' },
  red: { bg: 'bg-red-50/50', border: 'border-l-red-500', title: 'text-red-900', badge: 'bg-red-100 text-red-700' },
  emerald: { bg: 'bg-emerald-50/50', border: 'border-l-emerald-500', title: 'text-emerald-900', badge: 'bg-emerald-100 text-emerald-700' },
};

function AlertSection({ color, icon, title, badge, subtitle, children }: {
  color: string; icon: React.ReactNode; title: string; badge: number; subtitle: string; children: React.ReactNode;
}) {
  const c = ALERT_COLORS[color] ?? ALERT_COLORS['amber']!;
  return (
    <div className={`${c.bg} border border-stone-200 border-l-4 ${c.border} rounded-xl shadow-sm overflow-hidden`}>
      <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={c.title}>{icon}</span>
          <h3 className={`text-sm font-semibold uppercase tracking-wider ${c.title}`}>{title}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${c.badge}`}>{badge}</span>
        </div>
        <span className="text-xs text-stone-400 italic">{subtitle}</span>
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  );
}

// ── Avatar ──
const AVATAR_COLORS: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-800',
  blue: 'bg-blue-100 text-blue-800',
  amber: 'bg-amber-100 text-amber-800',
  purple: 'bg-purple-100 text-purple-800',
  indigo: 'bg-indigo-100 text-indigo-800',
  stone: 'bg-stone-100 text-stone-700',
  red: 'bg-red-100 text-red-800',
};

function Avatar({ name, color }: { name: string; color: string }) {
  const c = AVATAR_COLORS[color] ?? AVATAR_COLORS['stone']!;
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c}`}>
      {getInitials(name)}
    </div>
  );
}

// ── MTD Card ──
const MTD_CARD_COLORS: Record<string, { value: string; bg: string }> = {
  emerald: { value: 'text-emerald-800', bg: 'bg-emerald-50/60' },
  blue: { value: 'text-blue-800', bg: 'bg-blue-50/60' },
  amber: { value: 'text-amber-800', bg: 'bg-amber-50/60' },
  red: { value: 'text-red-700', bg: 'bg-red-50/60' },
};

function MTDCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  const c = MTD_CARD_COLORS[tone] ?? MTD_CARD_COLORS['blue']!;
  return (
    <div className={`${c.bg} rounded-lg p-3 border border-stone-100`}>
      <div className="text-xs text-stone-500 uppercase tracking-wider leading-tight">{label}</div>
      <div className={`text-xl mt-1.5 font-bold ${c.value}`} style={{ fontFamily: "'Cormorant Garamond', serif" }}>{value}</div>
      <div className="text-xs text-stone-400 mt-1 leading-tight">{sub}</div>
    </div>
  );
}
