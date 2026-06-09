import type { CorporateStage } from '@/lib/types/booking';

export const CORPORATE_STAGES: Record<
  CorporateStage,
  { label: string; color: string; step: number }
> = {
  inquiry: { label: 'Inquiry', color: 'bg-stone-100 text-stone-700', step: 1 },
  cost_sheet_draft: { label: 'Cost Sheet — Draft', color: 'bg-blue-50 text-blue-700', step: 2 },
  cost_sheet_sent: { label: 'Quote Sent', color: 'bg-blue-100 text-blue-800', step: 3 },
  cost_sheet_accepted: { label: 'Quote Accepted', color: 'bg-purple-100 text-purple-800', step: 4 },
  pi_generated: { label: 'Proforma Invoice Sent', color: 'bg-amber-100 text-amber-800', step: 5 },
  advance_paid: { label: 'Advance Paid', color: 'bg-teal-100 text-teal-800', step: 6 },
  confirmed: { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-800', step: 7 },
  checked_in: { label: 'Checked-In', color: 'bg-emerald-200 text-emerald-900', step: 8 },
  completed: { label: 'Completed', color: 'bg-stone-100 text-stone-600', step: 9 },
  // Display-only off-pipeline state. Not stored in corporate_stage (a lost deal
  // is persisted as bookings.status = 'cancelled'); step 0 keeps it out of
  // forward-progress comparisons.
  lost: { label: 'Lost', color: 'bg-rose-100 text-rose-700', step: 0 },
};

// Reasons offered when marking a corporate deal lost (kept short + resort-relevant).
export const CORPORATE_LOST_REASONS = [
  'Price too high',
  'Dates not available',
  'Chose another venue',
  'Event cancelled / postponed',
  'Budget not approved',
  'No response from client',
  'Other',
];

export const CORPORATE_STAGE_ORDER: CorporateStage[] = [
  'inquiry',
  'cost_sheet_draft',
  'cost_sheet_sent',
  'cost_sheet_accepted',
  'pi_generated',
  'advance_paid',
  'confirmed',
  'checked_in',
  'completed',
];

// Step number for forward-only stage comparisons. Higher = further along.
export function corporateStageStep(stage: string | null | undefined): number {
  if (!stage) return 0;
  return CORPORATE_STAGES[stage as CorporateStage]?.step ?? 0;
}
