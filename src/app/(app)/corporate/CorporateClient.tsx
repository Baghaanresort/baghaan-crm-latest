'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Edit2, FileText, UtensilsCrossed, History, LogIn, CheckCheck, LayoutGrid, List, Send, Check, Download, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { sendCostSheet, markCostSheetAccepted, generateProformaInvoice, checkInCorporate, completeCorporate } from '@/lib/actions/corporate';
import { CORPORATE_STAGES, corporateStageStep } from '@/lib/constants/corporate';
import { getBookingPaymentStatus } from '@/lib/utils/booking';
import { fmtDate } from '@/lib/utils/date';
import { DateInput } from '@/components/ui/DateInput';
import { NumberInput } from '@/components/ui/NumberInput';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import type { Booking, CorporateStage } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import type { UserRole } from '@/lib/types/profile';
import dynamic from 'next/dynamic';

const NEXT_ACTION: Record<CorporateStage, string> = {
  inquiry: 'Create cost sheet', cost_sheet_draft: 'Send quote', cost_sheet_sent: 'Mark accepted',
  cost_sheet_accepted: 'Generate PI', pi_generated: 'Collect advance', advance_paid: 'Confirming…',
  confirmed: 'Check-in', checked_in: 'Complete', completed: '—', lost: '—',
};

const KANBAN_COLUMNS: Array<{ title: string; stages: CorporateStage[] }> = [
  { title: 'Inquiry', stages: ['inquiry'] },
  { title: 'Draft', stages: ['cost_sheet_draft'] },
  { title: 'Quote Sent', stages: ['cost_sheet_sent'] },
  { title: 'Accepted', stages: ['cost_sheet_accepted'] },
  { title: 'PI / Advance', stages: ['pi_generated', 'advance_paid'] },
  { title: 'Confirmed', stages: ['confirmed'] },
  { title: 'Checked-In', stages: ['checked_in'] },
  { title: 'Completed', stages: ['completed'] },
];

const CostSheetModal = dynamic(() => import('@/components/corporate/CostSheetModal').then(m => ({ default: m.CostSheetModal })), { ssr: false });
const ProformaInvoicePreview = dynamic(() => import('@/components/corporate/ProformaInvoicePreview').then(m => ({ default: m.ProformaInvoicePreview })), { ssr: false });
const PaymentModal = dynamic(() => import('@/components/payments/PaymentModal').then(m => ({ default: m.PaymentModal })), { ssr: false });
const CorporateBookingModal = dynamic(() => import('@/components/corporate/CorporateBookingModal').then(m => ({ default: m.CorporateBookingModal })), { ssr: false });
const CorporateActivityModal = dynamic(() => import('@/components/corporate/CorporateActivityModal').then(m => ({ default: m.CorporateActivityModal })), { ssr: false });
const CorporateLostModal = dynamic(() => import('@/components/corporate/CorporateLostModal').then(m => ({ default: m.CorporateLostModal })), { ssr: false });

interface Props {
  initialBookings: Booking[];
  initialPayments: Payment[];
  users: Array<{ name: string; role: string }>;
  lastActivity: Record<string, { message: string; createdAt: string }>;
  currentUser: { id: string; name: string; role: UserRole };
}

export function CorporateClient({ initialBookings, initialPayments, users, lastActivity, currentUser }: Props) {
  const router = useRouter();
  const bookings = initialBookings;
  const payments = initialPayments;
  const role = currentUser.role;
  const isSales = role === 'Sales';
  const isAdmin = role === 'Admin';
  const canEdit = isSales || role === 'Front Office' || isAdmin;

  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [arrivalFrom, setArrivalFrom] = useState('');
  const [arrivalTo, setArrivalTo] = useState('');
  const [minRevenue, setMinRevenue] = useState(0);
  const [isPending, startTransition] = useTransition();

  const [showNew, setShowNew] = useState(false);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [costSheetFor, setCostSheetFor] = useState<Booking | null>(null);
  const [piFor, setPiFor] = useState<Booking | null>(null);
  const [paymentFor, setPaymentFor] = useState<Booking | null>(null);
  const [activityFor, setActivityFor] = useState<Booking | null>(null);
  const [lostFor, setLostFor] = useState<Booking | null>(null);

  const pStats = (b: Booking) => getBookingPaymentStatus(b, payments);

  // A lost deal is persisted as status='cancelled'; surface it as the display-only
  // 'lost' stage. Otherwise use the real corporate stage.
  const isLost = (b: Booking) => b.status === 'cancelled';
  const displayStage = (b: Booking): CorporateStage => (isLost(b) ? 'lost' : ((b.corporateStage ?? 'inquiry') as CorporateStage));

  const advanceStatus = (b: Booking): { label: string; cls: string } => {
    const ps = getBookingPaymentStatus(b, payments);
    if (ps.billAmount > 0 && ps.balance <= 0) return { label: 'Paid', cls: 'bg-emerald-100 text-emerald-800' };
    if (ps.totalPaid > 0) return { label: 'Partial', cls: 'bg-amber-100 text-amber-800' };
    return { label: 'Pending', cls: 'bg-stone-100 text-stone-600' };
  };

  const companies = useMemo(() => Array.from(new Set(bookings.map(b => b.companyName).filter(Boolean))).sort(), [bookings]);

  const filtered = useMemo(() => {
    return bookings.filter(b => {
      const lost = b.status === 'cancelled';
      // Lost deals are hidden from the pipeline unless explicitly filtered for.
      if (filterStage === 'lost') { if (!lost) return false; }
      else if (lost) return false;
      else if (filterStage !== 'all' && b.corporateStage !== filterStage) return false;
      if (filterCompany !== 'all' && b.companyName !== filterCompany) return false;
      if (arrivalFrom && (b.arrival ?? '') < arrivalFrom) return false;
      if (arrivalTo && (b.arrival ?? '') > arrivalTo) return false;
      if (minRevenue > 0 && b.totalAmount < minRevenue) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!`${b.companyName} ${b.contactName} ${b.contactNumber} ${b.confirmationNumber} ${b.proformaInvoice?.piNumber ?? ''}`.toLowerCase().includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.arrival ?? '').localeCompare(a.arrival ?? ''));
  }, [bookings, search, filterStage, filterCompany, arrivalFrom, arrivalTo, minRevenue]);

  const summary = useMemo(() => {
    const pipeline = bookings.filter(b => b.status !== 'cancelled' && !['completed'].includes(b.corporateStage ?? ''));
    const pipelineValue = pipeline.reduce((s, b) => s + b.totalAmount, 0);
    const awaitingAdvance = bookings.filter(b => b.corporateStage === 'pi_generated' && pStats(b).totalPaid === 0);
    const advanceValue = awaitingAdvance.reduce((s, b) => s + (b.proformaInvoice?.advanceRequired ?? 0), 0);
    return { pipelineValue, pipelineCount: pipeline.length, awaitingAdvance: awaitingAdvance.length, advanceValue };
  }, [bookings, payments]);

  const handleSend = (b: Booking) => {
    startTransition(async () => {
      const result = await sendCostSheet(b.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Cost sheet marked as sent');
    });
  };

  const handleAccept = (b: Booking) => {
    startTransition(async () => {
      const result = await markCostSheetAccepted(b.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Cost sheet accepted');
    });
  };

  const handleGenPI = (b: Booking) => {
    startTransition(async () => {
      const result = await generateProformaInvoice(b.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(`Proforma Invoice ${result.data.piNumber} generated`);
      setTimeout(() => setPiFor(b), 100);
    });
  };

  const handleCheckIn = (b: Booking) => {
    startTransition(async () => {
      const result = await checkInCorporate(b.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Guests checked in');
    });
  };

  const handleComplete = (b: Booking) => {
    startTransition(async () => {
      const result = await completeCorporate(b.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Booking completed');
    });
  };

  // Same-origin file download — the route's Content-Disposition: attachment
  // header makes the browser save the PDF instead of navigating to it.
  const downloadPdf = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // One primary "next step" per row (mirrors the detail page's Next Action),
  // plus everything else tucked into a "⋯ More" menu so the row stays scannable.
  type PrimaryAction = { id: string; label: string; icon: React.ReactNode; onClick: () => void };
  const canGenPI = isSales || isAdmin;
  const canPay = canEdit;

  const rowActions = (b: Booking): { primary: PrimaryAction | null; muted: string; menu: ActionMenuItem[] } => {
    const stage = (b.corporateStage ?? 'inquiry') as CorporateStage;
    const hasCS = !!b.costSheet?.lineItems?.length;
    const hasPI = !!b.proformaInvoice;

    // Lost deal: no workflow actions, just records + history.
    if (isLost(b)) {
      const lostMenu: ActionMenuItem[] = [];
      if (hasCS) lostMenu.push({ label: 'Download Quotation (PDF)', icon: <Download size={13} />, onClick: () => downloadPdf(`/api/pdf/cost-sheet?bookingId=${b.id}`) });
      if (hasPI) lostMenu.push({ label: 'Download Proforma Invoice (PDF)', icon: <Download size={13} />, onClick: () => downloadPdf(`/api/pdf/pi?bookingId=${b.id}`) });
      lostMenu.push({ label: 'Activity Log', icon: <History size={13} />, onClick: () => setActivityFor(b) });
      return { primary: null, muted: 'Lost', menu: lostMenu };
    }

    let primary: PrimaryAction | null = null;
    let muted = '—';
    switch (stage) {
      case 'inquiry':
        muted = 'Create cost sheet';
        if (canEdit) primary = { id: 'costsheet', label: 'Create Cost Sheet', icon: <FileText size={13} />, onClick: () => setCostSheetFor(b) };
        break;
      case 'cost_sheet_draft':
        muted = 'Send quote';
        if (canEdit) primary = { id: 'send', label: 'Send Quote', icon: <Send size={13} />, onClick: () => handleSend(b) };
        break;
      case 'cost_sheet_sent':
        muted = 'Mark accepted';
        if (canEdit) primary = { id: 'accept', label: 'Mark Accepted', icon: <Check size={13} />, onClick: () => handleAccept(b) };
        break;
      case 'cost_sheet_accepted':
        muted = 'Generate PI';
        if (canGenPI && !hasPI) primary = { id: 'genpi', label: 'Generate PI', icon: <FileText size={13} />, onClick: () => handleGenPI(b) };
        break;
      case 'pi_generated':
        muted = 'Collect advance';
        if (canPay) primary = { id: 'pay', label: 'Record Payment', icon: <Plus size={13} />, onClick: () => setPaymentFor(b) };
        break;
      case 'advance_paid':
        muted = 'Confirming…';
        break;
      case 'confirmed':
        muted = 'Check-in';
        if (canEdit) primary = { id: 'checkin', label: 'Check-In', icon: <LogIn size={13} />, onClick: () => handleCheckIn(b) };
        break;
      case 'checked_in':
        muted = 'Complete';
        if (canEdit) primary = { id: 'complete', label: 'Complete', icon: <CheckCheck size={13} />, onClick: () => handleComplete(b) };
        break;
      case 'completed':
        muted = 'Done';
        break;
    }

    const menu: Array<ActionMenuItem & { id: string }> = [];
    if (canEdit) menu.push({ id: 'costsheet', label: hasCS ? 'Edit Cost Sheet' : 'Build Cost Sheet', icon: <FileText size={13} />, onClick: () => setCostSheetFor(b) });
    if (canGenPI && !hasPI) menu.push({ id: 'genpi', label: 'Generate Proforma Invoice', icon: <FileText size={13} />, onClick: () => handleGenPI(b) });
    if (canPay && (stage === 'cost_sheet_accepted' || stage === 'pi_generated' || stage === 'advance_paid'))
      menu.push({ id: 'pay', label: 'Record Payment', icon: <Plus size={13} />, onClick: () => setPaymentFor(b) });
    if (hasCS) menu.push({ id: 'cspdf', label: 'Download Quotation (PDF)', icon: <Download size={13} />, onClick: () => downloadPdf(`/api/pdf/cost-sheet?bookingId=${b.id}`) });
    if (hasPI) {
      menu.push({ id: 'viewpi', label: 'View Proforma Invoice', icon: <FileText size={13} />, onClick: () => setPiFor(b) });
      menu.push({ id: 'pipdf', label: 'Download Proforma Invoice (PDF)', icon: <Download size={13} />, onClick: () => downloadPdf(`/api/pdf/pi?bookingId=${b.id}`) });
    }
    if (canEdit) menu.push({ id: 'editbooking', label: 'Edit Booking', icon: <Edit2 size={13} />, onClick: () => setEditBooking(b) });
    menu.push({ id: 'activity', label: 'Activity Log', icon: <History size={13} />, onClick: () => setActivityFor(b) });
    // Mark lost — only before the deal is confirmed, Sales/Admin only.
    if ((isSales || isAdmin) && corporateStageStep(stage) < corporateStageStep('confirmed'))
      menu.push({ id: 'lost', label: 'Mark as Lost', icon: <Ban size={13} />, tone: 'danger', onClick: () => setLostFor(b) });

    const filtered = primary ? menu.filter(m => m.id !== primary.id) : menu;
    return { primary, muted, menu: filtered };
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-stone-300">
        <div>
          <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>Corporate / Group Bookings</h2>
          <p className="text-sm text-stone-500 italic">Cost sheet → Proforma invoice → Advance → Confirmed</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push('/corporate/menu')} className="bg-white border border-stone-300 text-stone-600 hover:bg-stone-50 px-4 py-2.5 text-sm flex items-center gap-1.5 transition">
            <UtensilsCrossed size={14} /> MANAGE MENU
          </button>
          {(isSales || isAdmin) && (
            <button onClick={() => setShowNew(true)} className="bg-emerald-900 hover:bg-emerald-800 text-amber-100 px-5 py-2.5 text-sm tracking-wider flex items-center gap-2 transition">
              <Plus size={16} /> NEW COMPANY DETAILS
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[['Active Pipeline', summary.pipelineCount, `₹${summary.pipelineValue.toLocaleString('en-IN')} total`, false],
          ['Awaiting Advance', summary.awaitingAdvance, `₹${summary.advanceValue.toLocaleString('en-IN')} to collect`, summary.awaitingAdvance > 0],
          ['Total Corporate', bookings.length, 'all time', false]].map(([label, val, sub, accent]) => (
          <div key={String(label)} className="bg-white border border-stone-200 p-4">
            <div className="text-xs text-stone-500 uppercase tracking-wider">{label}</div>
            <div className={`text-2xl mt-1 font-semibold ${accent ? 'text-amber-700' : 'text-emerald-900'}`} style={{ fontFamily: "'Cormorant Garamond', serif" }}>{val}</div>
            <div className="text-xs text-stone-400 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Filters + view toggle */}
      <div className="space-y-3 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex-1 relative min-w-[220px]">
            <Search size={14} className="absolute left-3 top-3 text-stone-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company, contact, PI number..." className="w-full pl-9 pr-3 py-2 border border-stone-300 text-sm focus:border-emerald-700 outline-none bg-white" />
          </div>
          <div className="flex border border-stone-300 bg-white">
            <button onClick={() => setView('table')} className={`px-3 py-2 text-sm flex items-center gap-1.5 transition ${view === 'table' ? 'bg-emerald-900 text-amber-100' : 'text-stone-600 hover:bg-stone-50'}`}><List size={14} /> Table</button>
            <button onClick={() => setView('kanban')} className={`px-3 py-2 text-sm flex items-center gap-1.5 transition ${view === 'kanban' ? 'bg-emerald-900 text-amber-100' : 'text-stone-600 hover:bg-stone-50'}`}><LayoutGrid size={14} /> Kanban</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <select value={filterStage} onChange={e => setFilterStage(e.target.value)} className="px-3 py-2 border border-stone-300 text-sm bg-white outline-none">
            <option value="all">All Stages</option>
            {Object.entries(CORPORATE_STAGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="px-3 py-2 border border-stone-300 text-sm bg-white outline-none max-w-[200px]">
            <option value="all">All Companies</option>
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <span className="text-xs uppercase tracking-wider text-stone-500">Arrival</span>
            <DateInput value={arrivalFrom} clearable onChange={setArrivalFrom} className="min-w-[140px]" />
            <span className="text-stone-400">–</span>
            <DateInput value={arrivalTo} clearable onChange={setArrivalTo} className="min-w-[140px]" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs uppercase tracking-wider text-stone-500">Min ₹</span>
            <NumberInput value={minRevenue} min={0} onChange={setMinRevenue} className="w-28 px-3 py-2 border border-stone-300 text-sm outline-none bg-white" />
          </div>
          {(filterStage !== 'all' || filterCompany !== 'all' || arrivalFrom || arrivalTo || minRevenue > 0 || search) && (
            <button onClick={() => { setFilterStage('all'); setFilterCompany('all'); setArrivalFrom(''); setArrivalTo(''); setMinRevenue(0); setSearch(''); }} className="text-xs text-stone-500 hover:text-stone-700 underline">Clear filters</button>
          )}
          <span className="text-xs text-stone-400 ml-auto">{filtered.length} of {bookings.length}</span>
        </div>
      </div>

      {/* Table view */}
      {view === 'table' ? (
      <div className="bg-white border border-stone-200 overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-stone-400 italic">No corporate bookings match filters</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-emerald-900 text-amber-100">
              <tr>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Company</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Contact</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Arrival</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Departure</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Rooms</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Value</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Advance</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Stage</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Owner</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Last Activity</th>
                <th className="text-left p-3 text-xs uppercase tracking-wider">Next Action</th>
                <th className="text-right p-3 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => {
                const stage = displayStage(b);
                const stageInfo = CORPORATE_STAGES[stage];
                const adv = advanceStatus(b);
                const la = lastActivity[b.id];
                const acts = rowActions(b);
                return (
                  <tr key={b.id} className="border-t border-stone-100 hover:bg-stone-50">
                    <td className="p-3">
                      <button onClick={() => router.push(`/corporate/${b.id}`)} className="font-medium text-emerald-900 hover:underline text-left">{b.companyName || b.guestName || '—'}</button>
                      <div className="text-xs font-mono text-stone-500">{b.confirmationNumber}</div>
                      {b.proformaInvoice?.piNumber && <div className="text-xs text-purple-700 font-mono">{b.proformaInvoice.piNumber}</div>}
                    </td>
                    <td className="p-3 text-xs">
                      <div>{b.contactName || '—'}</div>
                      <div className="text-stone-500">{b.contactNumber}</div>
                    </td>
                    <td className="p-3 text-xs whitespace-nowrap">{fmtDate(b.arrival)}</td>
                    <td className="p-3 text-xs whitespace-nowrap">{fmtDate(b.departure)}</td>
                    <td className="p-3 text-xs">{b.rooms?.length ?? 0}<span className="text-stone-400"> · {b.nights}n</span></td>
                    <td className="p-3 text-right whitespace-nowrap">₹{b.totalAmount.toLocaleString('en-IN')}</td>
                    <td className="p-3"><span className={`text-xs px-2 py-0.5 ${adv.cls}`}>{adv.label}</span></td>
                    <td className="p-3"><span className={`text-xs px-2 py-0.5 ${stageInfo?.color ?? ''}`}>{stageInfo?.label ?? stage}</span></td>
                    <td className="p-3 text-xs text-stone-500">{b.createdBy || '—'}</td>
                    <td className="p-3 text-xs text-stone-500 whitespace-nowrap" title={la?.message ?? ''}>{la ? fmtDate(la.createdAt) : '—'}</td>
                    <td className="p-3 text-xs text-stone-600 whitespace-nowrap">{NEXT_ACTION[stage]}</td>
                    <td className="p-3 text-right">
                      <div className="flex gap-2 justify-end items-center">
                        {acts.primary ? (
                          <button onClick={acts.primary.onClick} disabled={isPending} className="text-xs bg-emerald-900 text-amber-100 px-2.5 py-1.5 hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap">
                            {acts.primary.icon} {acts.primary.label}
                          </button>
                        ) : (
                          <span className="text-xs text-stone-400 italic whitespace-nowrap">{acts.muted}</span>
                        )}
                        <ActionMenu items={acts.menu} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      ) : (
        /* Kanban view (read-only pipeline; stages move via workflow + automation) */
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-w-max">
            {KANBAN_COLUMNS.map(col => {
              const cards = filtered.filter(b => col.stages.includes((b.corporateStage ?? 'inquiry') as CorporateStage));
              const colValue = cards.reduce((s, b) => s + b.totalAmount, 0);
              return (
                <div key={col.title} className="w-64 flex-shrink-0">
                  <div className="bg-emerald-900 text-amber-100 px-3 py-2 flex justify-between items-center">
                    <span className="text-xs uppercase tracking-wider font-medium">{col.title}</span>
                    <span className="text-xs bg-emerald-800 px-1.5 rounded-full">{cards.length}</span>
                  </div>
                  <div className="bg-stone-100 p-2 space-y-2 min-h-[120px]">
                    {cards.length === 0 ? (
                      <div className="text-xs text-stone-400 italic text-center py-6">—</div>
                    ) : cards.map(b => {
                      const adv = advanceStatus(b);
                      return (
                        <button key={b.id} onClick={() => router.push(`/corporate/${b.id}`)} className="block w-full text-left bg-white border border-stone-200 p-2.5 hover:border-amber-400 hover:shadow-sm transition">
                          <div className="font-medium text-sm text-stone-800 truncate">{b.companyName || b.guestName || '—'}</div>
                          <div className="text-xs text-stone-400 font-mono">{b.confirmationNumber}</div>
                          <div className="text-xs text-stone-500 mt-1">{fmtDate(b.arrival)} · {b.rooms?.length ?? 0} rm</div>
                          <div className="flex justify-between items-center mt-1.5">
                            <span className="text-sm font-medium text-emerald-800">₹{b.totalAmount.toLocaleString('en-IN')}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 ${adv.cls}`}>{adv.label}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {cards.length > 0 && <div className="text-xs text-stone-400 text-right px-1 mt-1">₹{colValue.toLocaleString('en-IN')}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showNew && <CorporateBookingModal users={users} currentUser={currentUser} existingBookings={bookings} onClose={() => setShowNew(false)} />}
      {editBooking && <CorporateBookingModal booking={editBooking} users={users} currentUser={currentUser} existingBookings={bookings} onClose={() => setEditBooking(null)} />}
      {costSheetFor && <CostSheetModal booking={costSheetFor} currentUser={currentUser} onClose={() => setCostSheetFor(null)} />}
      {piFor && <ProformaInvoicePreview booking={piFor} onClose={() => setPiFor(null)} />}
      {paymentFor && <PaymentModal booking={paymentFor} currentUser={currentUser} payments={payments.filter(p => p.bookingId === paymentFor.id)} onClose={() => setPaymentFor(null)} />}
      {activityFor && <CorporateActivityModal booking={activityFor} isAdmin={isAdmin} onClose={() => setActivityFor(null)} />}
      {lostFor && <CorporateLostModal booking={lostFor} onClose={() => setLostFor(null)} />}
    </div>
  );
}
