import type { CorporateStage } from '@/lib/types/booking';

export const CORPORATE_STAGES: Record<
  CorporateStage,
  { label: string; color: string; step: number }
> = {
  inquiry: { label: 'Inquiry', color: 'bg-stone-100 text-stone-700', step: 1 },
  cost_sheet_draft: { label: 'Cost Sheet — Draft', color: 'bg-blue-50 text-blue-700', step: 2 },
  cost_sheet_sent: { label: 'Cost Sheet — Sent', color: 'bg-blue-100 text-blue-800', step: 3 },
  cost_sheet_accepted: { label: 'Cost Sheet — Accepted', color: 'bg-purple-100 text-purple-800', step: 4 },
  pi_generated: { label: 'Proforma Invoice Sent', color: 'bg-amber-100 text-amber-800', step: 5 },
  advance_paid: { label: 'Advance Paid — Confirmed', color: 'bg-emerald-100 text-emerald-800', step: 6 },
  completed: { label: 'Completed', color: 'bg-stone-100 text-stone-600', step: 7 },
};

export const CORPORATE_STAGE_ORDER: CorporateStage[] = [
  'inquiry',
  'cost_sheet_draft',
  'cost_sheet_sent',
  'cost_sheet_accepted',
  'pi_generated',
  'advance_paid',
  'completed',
];
