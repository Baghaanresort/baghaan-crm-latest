'use client';

import { useState, useMemo, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  ArrowLeft, Edit2, Building2, CalendarDays, Users, FileText,
  Plus, Receipt, History, CheckCheck, LogIn, ShieldAlert, Download, Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  sendCostSheet, markCostSheetAccepted, generateProformaInvoice,
  checkInCorporate, completeCorporate, getCorporateActivity,
} from '@/lib/actions/corporate';
import { sendCorporateAdvanceRequest } from '@/lib/actions/transactions';
import { CORPORATE_STAGES, CORPORATE_STAGE_ORDER, corporateStageStep } from '@/lib/constants/corporate';
import { getBookingPaymentStatus } from '@/lib/utils/booking';
import { fmtDate, fmtDateTime } from '@/lib/utils/date';
import type { Booking, CorporateStage } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import type { UserRole } from '@/lib/types/profile';
import type { CorporateActivityEntry } from '@/lib/types/corporate-activity';

const CostSheetModal = dynamic(() => import('@/components/corporate/CostSheetModal').then(m => ({ default: m.CostSheetModal })), { ssr: false });
const PaymentModal = dynamic(() => import('@/components/payments/PaymentModal').then(m => ({ default: m.PaymentModal })), { ssr: false });
const CorporateBookingModal = dynamic(() => import('@/components/corporate/CorporateBookingModal').then(m => ({ default: m.CorporateBookingModal })), { ssr: false });
const ProformaInvoicePreview = dynamic(() => import('@/components/corporate/ProformaInvoicePreview').then(m => ({ default: m.ProformaInvoicePreview })), { ssr: false });
const CorporateLostModal = dynamic(() => import('@/components/corporate/CorporateLostModal').then(m => ({ default: m.CorporateLostModal })), { ssr: false });

interface Props {
  booking: Booking;
  payments: Payment[];
  users: Array<{ name: string; role: string }>;
  currentUser: { id: string; name: string; role: UserRole };
}

const SHORT_LABEL: Record<CorporateStage, string> = {
  inquiry: 'Inquiry', cost_sheet_draft: 'Draft', cost_sheet_sent: 'Quote Sent',
  cost_sheet_accepted: 'Accepted', pi_generated: 'PI Sent', advance_paid: 'Advance',
  confirmed: 'Confirmed', checked_in: 'Check-In', completed: 'Done', lost: 'Lost',
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function CorporateDetailClient({ booking, payments, users, currentUser }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCostSheet, setShowCostSheet] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showPI, setShowPI] = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [activity, setActivity] = useState<CorporateActivityEntry[] | null>(null);

  const role = currentUser.role;
  const isSales = role === 'Sales', isAdmin = role === 'Admin', isFO = role === 'Front Office';
  const canEdit = isSales || isFO || isAdmin;
  const canGenPI = isSales || isAdmin;
  const canPay = isSales || isFO || isAdmin;
  // Matches the server gate in sendCorporateAdvanceRequest (Sales / Sales Admin / Admin).
  const canSendLink = isSales || role === 'Sales Admin' || isAdmin;
  const lost = booking.status === 'cancelled';

  const stage = (booking.corporateStage ?? 'inquiry') as CorporateStage;
  const ps = useMemo(() => getBookingPaymentStatus(booking, payments), [booking, payments]);
  const gc = booking.guestCount ?? { single: 0, double: 0, triple: 0 };
  const totalGuests = gc.single + gc.double + gc.triple || booking.adults;

  useEffect(() => {
    let on = true;
    getCorporateActivity(booking.id).then(r => { if (on && r.success) setActivity(r.data); });
    return () => { on = false; };
  }, [booking.id]);

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, okMsg: string) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.success) { toast.error(r.error ?? 'Action failed'); return; }
      toast.success(okMsg);
      router.refresh();
    });

  // Payment timeline (real events from PI + payments)
  const timeline = useMemo(() => {
    const ev: Array<{ id: string; label: string; date: string; by: string; tone: string }> = [];
    if (booking.proformaInvoice?.generatedAt) {
      ev.push({ id: 'pi', label: `Proforma Invoice ${booking.proformaInvoice.piNumber} generated`, date: booking.proformaInvoice.generatedAt, by: booking.proformaInvoice.generatedBy, tone: 'bg-amber-500' });
    }
    payments.forEach(p => {
      ev.push({ id: `${p.id}-r`, label: `Payment received — ${inr(p.amount)} (${p.mode})`, date: p.recordedAt || p.paymentDate, by: p.recordedBy, tone: 'bg-stone-400' });
      if (p.verified && p.verifiedAt) ev.push({ id: `${p.id}-v`, label: `Payment verified — ${inr(p.amount)}`, date: p.verifiedAt, by: p.verifiedBy ?? '', tone: 'bg-emerald-600' });
    });
    return ev.sort((a, b) => a.date.localeCompare(b.date));
  }, [booking, payments]);

  // Stage-aware next action
  type NextBtn = { label: string; on: () => void } | null;
  type NextAction = { desc: string; btn: NextBtn; alt?: NextBtn };
  const next = useMemo<NextAction>(() => {
    const open = (s: (v: boolean) => void) => () => s(true);
    switch (stage) {
      case 'inquiry': return { desc: 'Build the cost sheet to start quoting this deal.', btn: canEdit ? { label: 'Create Cost Sheet', on: open(setShowCostSheet) } : null };
      case 'cost_sheet_draft': return { desc: 'Cost sheet drafted. Send the quote to the client.', btn: canEdit ? { label: 'Send Quote', on: () => run(() => sendCostSheet(booking.id), 'Quote sent') } : null, alt: canEdit ? { label: 'Edit Cost Sheet', on: open(setShowCostSheet) } : null };
      case 'cost_sheet_sent': return { desc: 'Quote sent. Mark it accepted once the client agrees.', btn: canEdit ? { label: 'Mark Quote Accepted', on: () => run(() => markCostSheetAccepted(booking.id), 'Quote accepted') } : null, alt: canEdit ? { label: 'Revise Quote', on: open(setShowCostSheet) } : null };
      case 'cost_sheet_accepted': return { desc: 'Quote accepted. Generate the Proforma Invoice to request the advance.', btn: canGenPI ? { label: 'Generate Proforma Invoice', on: () => run(() => generateProformaInvoice(booking.id), 'Proforma invoice generated') } : null };
      case 'pi_generated': return {
        desc: `Advance of ${inr(ps.advanceRequired)} required. ${ps.advanceShortfall > 0 ? `${inr(ps.advanceShortfall)} still outstanding.` : 'Advance received — awaiting verification.'}`,
        btn: canSendLink ? { label: 'Send advance link', on: () => run(() => sendCorporateAdvanceRequest(booking.id), 'Advance payment link sent') } : (canPay ? { label: 'Record Advance Payment', on: open(setShowPayment) } : null),
        alt: canSendLink && canPay ? { label: 'Record Advance Payment', on: open(setShowPayment) } : null,
      };
      case 'advance_paid': return { desc: 'Advance paid — confirming the booking.', btn: canPay ? { label: 'Record Payment', on: open(setShowPayment) } : null };
      case 'confirmed': return { desc: 'Booking confirmed and rooms blocked. Check in the guests on arrival.', btn: canEdit ? { label: 'Check-In Guests', on: () => run(() => checkInCorporate(booking.id), 'Guests checked in') } : null };
      case 'checked_in': return { desc: 'Guests checked in. Settle the final bill, then complete the booking.', btn: canEdit ? { label: 'Complete Booking', on: () => run(() => completeCorporate(booking.id), 'Booking completed') } : null };
      case 'completed': return { desc: 'This deal is closed. 🎉', btn: null };
      default: return { desc: '', btn: null };
    }
  }, [stage, booking.id, ps, canEdit, canGenPI, canPay, canSendLink]); // eslint-disable-line react-hooks/exhaustive-deps

  const balanceTone = ps.billAmount > 0 && ps.balance <= 0 ? 'text-emerald-700' : ps.advanceShortfall > 0 ? 'text-red-600' : 'text-amber-600';
  const curStep = corporateStageStep(stage);
  const canMarkLost = (isSales || isAdmin) && !lost && corporateStageStep(stage) < corporateStageStep('confirmed');

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <button onClick={() => router.push('/corporate')} className="text-xs text-stone-500 hover:text-emerald-800 flex items-center gap-1 mb-2">
          <ArrowLeft size={12} /> Back to Corporate
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl text-emerald-900" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>{booking.companyName || booking.guestName || 'Corporate Booking'}</h2>
            <div className="flex items-center gap-2 mt-1 text-sm text-stone-500">
              <span className="font-mono">{booking.confirmationNumber}</span>
              {booking.proformaInvoice?.piNumber && <span className="text-purple-700 font-mono">· {booking.proformaInvoice.piNumber}</span>}
              <span className={`text-xs px-2 py-0.5 rounded ${lost ? CORPORATE_STAGES.lost.color : CORPORATE_STAGES[stage].color}`}>{lost ? CORPORATE_STAGES.lost.label : CORPORATE_STAGES[stage].label}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {canEdit && <button onClick={() => setShowEdit(true)} className="bg-white border border-stone-300 text-stone-600 hover:bg-stone-50 px-3 py-2 text-sm flex items-center gap-1.5"><Edit2 size={14} /> Edit</button>}
          </div>
        </div>
      </div>

      {/* Stage progress bar */}
      <div className="bg-white border border-stone-200 p-4 mb-5 overflow-x-auto">
        <div className="flex items-center min-w-[640px]">
          {CORPORATE_STAGE_ORDER.map((s, i) => {
            const step = corporateStageStep(s);
            const done = step < curStep, current = step === curStep;
            return (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${done ? 'bg-emerald-600 text-white' : current ? 'bg-amber-500 text-white ring-4 ring-amber-100' : 'bg-stone-200 text-stone-500'}`}>{i + 1}</div>
                  <span className={`text-[10px] mt-1 whitespace-nowrap ${current ? 'text-amber-700 font-semibold' : done ? 'text-emerald-700' : 'text-stone-400'}`}>{SHORT_LABEL[s]}</span>
                </div>
                {i < CORPORATE_STAGE_ORDER.length - 1 && <div className={`h-0.5 flex-1 mx-1 ${done ? 'bg-emerald-500' : 'bg-stone-200'}`} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Company */}
          <Card icon={<Building2 size={15} />} title="Company Information">
            <Grid>
              <Stat label="Company" value={booking.companyName || '—'} />
              <Stat label="GST Number" value={booking.companyGST || booking.gstNumber || '—'} />
              <Stat label="Contact Person" value={booking.contactName || booking.guestName || '—'} />
              <Stat label="Phone" value={booking.contactNumber || '—'} />
              <Stat label="Email" value={booking.contactEmail || booking.email || '—'} />
              <Stat label="Address" value={booking.companyAddress || '—'} />
            </Grid>
          </Card>

          {/* Stay */}
          <Card icon={<CalendarDays size={15} />} title="Stay Information">
            <Grid>
              <Stat label="Arrival" value={fmtDate(booking.arrival)} />
              <Stat label="Departure" value={fmtDate(booking.departure)} />
              <Stat label="Nights" value={String(booking.nights)} />
              <Stat label="Rooms" value={booking.rooms?.length ? `${booking.rooms.length} (${booking.rooms.join(', ')})` : '—'} />
              <Stat label="Total Guests" value={String(totalGuests)} />
              <Stat label="Occupancy" value={`${gc.single} single · ${gc.double} double · ${gc.triple} triple`} />
            </Grid>
            {booking.remarks && <div className="mt-3 text-sm text-stone-600 bg-stone-50 border border-stone-200 p-3"><Users size={12} className="inline mr-1" /> {booking.remarks}</div>}
          </Card>

          {/* Cost sheet */}
          <Card icon={<FileText size={15} />} title="Cost Sheet">
            {booking.costSheet?.lineItems?.length ? (
              <>
                <div className="text-sm text-stone-600 mb-2">{booking.costSheet.lineItems.length} line item{booking.costSheet.lineItems.length === 1 ? '' : 's'} · v{booking.costSheet.version ?? 1}</div>
                <div className="flex justify-between items-center bg-emerald-900 text-amber-100 px-4 py-2.5">
                  <span className="text-xs uppercase tracking-widest">Grand Total</span>
                  <span style={{ fontFamily: "'Cormorant Garamond', serif" }} className="text-xl font-semibold">{inr(booking.costSheet.grandTotal ?? booking.totalAmount)}</span>
                </div>
              </>
            ) : <div className="text-sm text-stone-400 italic">No cost sheet yet.</div>}
            <div className="flex gap-2 mt-3">
              {canEdit && <button onClick={() => setShowCostSheet(true)} className="text-xs bg-stone-700 text-white px-3 py-1.5 hover:bg-stone-800">{booking.costSheet?.lineItems?.length ? 'Edit Cost Sheet' : 'Build Cost Sheet'}</button>}
              {booking.costSheet?.lineItems?.length ? <button onClick={() => downloadPdf(`/api/pdf/cost-sheet?bookingId=${booking.id}`)} className="text-xs border border-emerald-700 text-emerald-800 px-3 py-1.5 hover:bg-emerald-50 flex items-center gap-1"><Download size={12} /> Download PDF</button> : null}
            </div>
          </Card>

          {/* Documents */}
          <Card icon={<FileText size={15} />} title="Documents">
            <div className="space-y-2">
              <DocRow available={!!booking.costSheet?.lineItems?.length} label="Cost Sheet / Quotation" onView={() => printDoc(`/api/print/cost-sheet?bookingId=${booking.id}`)} onPdf={() => downloadPdf(`/api/pdf/cost-sheet?bookingId=${booking.id}`)} />
              <DocRow available={!!booking.proformaInvoice} label="Proforma Invoice" onView={() => setShowPI(true)} onPdf={() => downloadPdf(`/api/pdf/pi?bookingId=${booking.id}`)} />
              <DocRow available={false} label="Tax Invoice (coming soon)" />
            </div>
            {payments.length > 0 && (
              <div className="mt-3 pt-3 border-t border-stone-100">
                <div className="text-xs uppercase tracking-wider text-stone-400 mb-1.5">Payment Receipts</div>
                {payments.map(p => (
                  <div key={p.id} className="flex justify-between text-sm py-0.5">
                    <span className="text-stone-600"><Receipt size={11} className="inline mr-1" />{fmtDate(p.paymentDate)} · {p.mode}{p.reference ? ` · ${p.reference}` : ''}</span>
                    <span className={p.verified ? 'text-emerald-700' : 'text-amber-600'}>{inr(p.amount)} {p.verified ? '✓' : '⏳'}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Payment timeline */}
          <Card icon={<History size={15} />} title="Payment Timeline">
            {timeline.length === 0 ? <div className="text-sm text-stone-400 italic">No payment events yet.</div> : (
              <ol className="relative border-l-2 border-stone-200 ml-2">
                {timeline.map(e => (
                  <li key={e.id} className="ml-5 pb-4 last:pb-0">
                    <span className={`absolute -left-[7px] mt-1 w-3 h-3 rounded-full ${e.tone} ring-2 ring-white`} />
                    <div className="text-sm text-stone-800">{e.label}</div>
                    <div className="text-xs text-stone-400 mt-0.5">{fmtDateTime(e.date)}{e.by ? ` · ${e.by}` : ''}</div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {/* Activity log */}
          <Card icon={<History size={15} />} title="Activity Log">
            {activity === null ? <div className="text-sm text-stone-400 italic">Loading…</div>
              : activity.length === 0 ? <div className="text-sm text-stone-400 italic">No activity recorded yet.</div>
              : (
                <ol className="relative border-l-2 border-stone-200 ml-2">
                  {activity.map(a => (
                    <li key={a.id} className="ml-5 pb-4 last:pb-0">
                      <span className={`absolute -left-[7px] mt-1 w-3 h-3 rounded-full ring-2 ring-white ${a.type === 'stage_override' ? 'bg-red-600' : a.type === 'confirmed' || a.type === 'completed' ? 'bg-emerald-600' : 'bg-stone-400'}`} />
                      <div className="text-sm text-stone-800">{a.message}</div>
                      <div className="text-xs text-stone-400 mt-0.5">{fmtDateTime(a.createdAt)} · {a.actor}</div>
                    </li>
                  ))}
                </ol>
              )}
          </Card>
        </div>

        {/* Sticky right rail */}
        <div className="space-y-5">
          <div className="lg:sticky lg:top-4 space-y-5">
            {/* Financial dashboard */}
            <div className="bg-white border border-stone-200">
              <div className="bg-emerald-900 text-amber-100 px-4 py-2.5 text-xs uppercase tracking-widest">Financial Summary</div>
              <div className="p-4 space-y-2.5">
                <Money label="Total Quote Value" value={inr(ps.billAmount)} strong />
                <Money label="Taxes" value="Included" muted />
                <Money label="Advance Required" value={inr(ps.advanceRequired)} />
                <Money label="Advance Received" value={inr(ps.totalPaid)} tone={ps.totalPaid > 0 ? 'text-emerald-700' : 'text-stone-500'} />
                <div className="border-t border-stone-200 pt-2.5">
                  <Money label="Outstanding" value={inr(Math.max(0, ps.balance))} tone={balanceTone} strong />
                </div>
              </div>
            </div>

            {/* Next action — or Lost banner */}
            {lost ? (
              <div className="bg-rose-50 border-2 border-rose-300 p-4">
                <div className="text-xs uppercase tracking-widest text-rose-800 font-semibold mb-1.5 flex items-center gap-1.5"><Ban size={13} /> Deal Lost</div>
                <p className="text-sm text-stone-700">This deal was marked lost and the booking cancelled. See the Activity Log for the reason. The record is kept for your history.</p>
              </div>
            ) : (
              <div className="bg-amber-50 border-2 border-amber-300 p-4">
                <div className="text-xs uppercase tracking-widest text-amber-800 font-semibold mb-1.5 flex items-center gap-1.5"><ShieldAlert size={13} /> Next Action</div>
                <p className="text-sm text-stone-700 mb-3">{next.desc}</p>
                {next.btn && (
                  <button onClick={next.btn.on} disabled={isPending} className="w-full bg-emerald-900 hover:bg-emerald-800 text-amber-100 px-4 py-2.5 text-sm tracking-wider transition disabled:opacity-50 flex items-center justify-center gap-2">
                    {iconFor(next.btn.label)} {next.btn.label}
                  </button>
                )}
                {next.alt && (
                  <button onClick={next.alt.on} disabled={isPending} className="w-full mt-2 bg-white border border-stone-300 text-stone-600 hover:bg-stone-50 px-4 py-2 text-sm transition disabled:opacity-50">
                    {next.alt.label}
                  </button>
                )}
                {!next.btn && !next.alt && stage !== 'completed' && <p className="text-xs text-stone-500 italic">No action available for your role.</p>}
                {canMarkLost && (
                  <button onClick={() => setShowLost(true)} disabled={isPending} className="w-full mt-2 text-xs text-rose-600 hover:text-rose-800 flex items-center justify-center gap-1.5 py-1.5">
                    <Ban size={12} /> Mark as Lost
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showCostSheet && <CostSheetModal booking={booking} currentUser={currentUser} onClose={() => { setShowCostSheet(false); router.refresh(); }} />}
      {showPayment && <PaymentModal booking={booking} currentUser={currentUser} payments={payments} onClose={() => { setShowPayment(false); router.refresh(); }} />}
      {showEdit && <CorporateBookingModal booking={booking} users={users} currentUser={currentUser} existingBookings={[]} onClose={() => { setShowEdit(false); router.refresh(); }} />}
      {showPI && <ProformaInvoicePreview booking={booking} onClose={() => setShowPI(false)} />}
      {showLost && <CorporateLostModal booking={booking} onClose={() => { setShowLost(false); router.refresh(); }} />}
    </div>
  );
}

// ---- helpers / subcomponents ----

function printDoc(url: string) {
  const w = window.open(url, '_blank');
  w?.addEventListener('load', () => setTimeout(() => w.print(), 300));
}

// Same-origin download — the route's attachment header saves the PDF to disk.
function downloadPdf(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function iconFor(label: string) {
  if (label.includes('Check-In')) return <LogIn size={14} />;
  if (label.includes('Complete')) return <CheckCheck size={14} />;
  if (label.includes('Payment')) return <Plus size={14} />;
  if (label.includes('Cost Sheet')) return <FileText size={14} />;
  return null;
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-stone-200">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-stone-100 text-emerald-900">
        {icon}<span className="text-xs uppercase tracking-widest font-medium">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-3">{children}</dl>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-stone-400 uppercase tracking-wider">{label}</dt>
      <dd className="text-sm text-stone-800 mt-0.5">{value}</dd>
    </div>
  );
}

function Money({ label, value, tone, strong, muted }: { label: string; value: string; tone?: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={`text-sm ${muted ? 'text-stone-400' : 'text-stone-600'}`}>{label}</span>
      <span className={`${strong ? 'text-base font-semibold' : 'text-sm'} ${tone ?? 'text-stone-800'}`} style={strong ? { fontFamily: "'Cormorant Garamond', serif" } : undefined}>{value}</span>
    </div>
  );
}

function DocRow({ available, label, onView, onPdf }: { available: boolean; label: string; onView?: () => void; onPdf?: () => void }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm flex items-center gap-1.5 ${available ? 'text-stone-700' : 'text-stone-300'}`}><FileText size={13} /> {label}</span>
      <div className="flex gap-2">
        {available && onView && <button onClick={onView} className="text-xs border border-stone-300 text-stone-600 px-2 py-1 hover:bg-stone-50">View</button>}
        {available && onPdf && <button onClick={onPdf} className="text-xs border border-emerald-700 text-emerald-800 px-2 py-1 hover:bg-emerald-50">PDF</button>}
        {!available && <span className="text-xs text-stone-300">—</span>}
      </div>
    </div>
  );
}
