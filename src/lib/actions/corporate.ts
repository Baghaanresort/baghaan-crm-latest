'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { logCorporateActivity } from '@/lib/server/corporateEngine';
import { CORPORATE_STAGES, corporateStageStep } from '@/lib/constants/corporate';
import { isValidPhone, normalizePhone, PHONE_ERROR } from '@/lib/validations/phone';
import type { AddOn, CostSheet, LineItem, ProformaInvoice, CorporateStage } from '@/lib/types/booking';
import type { CorporateActivityEntry } from '@/lib/types/corporate-activity';

async function getAuthedUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single();
  if (!profile) return null;
  return { id: user.id, name: profile.name as string, role: profile.role as string };
}

async function getPiCounter(supabase: Awaited<ReturnType<typeof createClient>>): Promise<number> {
  const { data } = await supabase.from('meta').select('value').eq('key', 'pi_counter').single();
  return data ? parseInt(data.value as string) : 1038;
}

function revalidateCorporatePaths() {
  revalidatePath('/corporate');
  revalidatePath('/dashboard');
  revalidatePath('/bookings');
}

// ---------- updateCostSheet ----------

export async function updateCostSheet(
  bookingId: string,
  costSheetData: Partial<CostSheet>
): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Front Office', 'Admin'].includes(actor.role)) {
    return err('Insufficient permissions');
  }

  // Fetch current booking — don't overwrite from stale client state
  const { data: current, error: fetchErr } = await supabase
    .from('bookings')
    .select('cost_sheet, corporate_stage, total_amount')
    .eq('id', bookingId)
    .single();

  if (fetchErr || !current) return err('Booking not found');

  const existingCostSheet = (current['cost_sheet'] as CostSheet | null);
  const currentStage = current['corporate_stage'] as string | null;

  const updatedCostSheet: CostSheet = {
    lineItems: existingCostSheet?.lineItems ?? [],
    grandTotal: existingCostSheet?.grandTotal ?? 0,
    notes: existingCostSheet?.notes ?? '',
    inclusions: existingCostSheet?.inclusions ?? [],
    terms: existingCostSheet?.terms ?? '',
    version: (existingCostSheet?.version ?? 0) + 1,
    ...costSheetData,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.name,
  };

  const newTotal = Number(costSheetData.grandTotal ?? existingCostSheet?.grandTotal ?? 0);
  const newStage = currentStage === 'inquiry' ? 'cost_sheet_draft' : currentStage;

  const { error } = await supabase
    .from('bookings')
    .update({
      cost_sheet: updatedCostSheet,
      total_amount: newTotal,
      corporate_stage: newStage,
    })
    .eq('id', bookingId);

  if (error) {
    console.error('[updateCostSheet]', error);
    return err('Failed to save cost sheet.');
  }

  await logCorporateActivity(supabase, bookingId, 'cost_sheet_updated', `Cost sheet updated (v${updatedCostSheet.version}) — total ₹${newTotal.toLocaleString('en-IN')}.`, actor);
  revalidateCorporatePaths();
  return ok(undefined);
}

// ---------- sendCostSheet ----------
// CRITICAL: Always fetch current cost_sheet from DB before merging sentAt/sentBy.
// This prevents overwriting line items that were just saved in updateCostSheet.

export async function sendCostSheet(bookingId: string): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Front Office', 'Admin'].includes(actor.role)) {
    return err('Insufficient permissions');
  }

  // Fetch CURRENT cost_sheet from DB (not from client state)
  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('cost_sheet')
    .eq('id', bookingId)
    .single();

  if (fetchErr || !booking) return err('Booking not found');

  const updatedCostSheet = {
    ...((booking['cost_sheet'] as CostSheet | null) ?? {}),
    sentAt: new Date().toISOString(),
    sentBy: actor.name,
  };

  const { error } = await supabase
    .from('bookings')
    .update({ corporate_stage: 'cost_sheet_sent', cost_sheet: updatedCostSheet })
    .eq('id', bookingId);

  if (error) {
    console.error('[sendCostSheet]', error);
    return err('Failed to mark cost sheet as sent.');
  }

  await logCorporateActivity(supabase, bookingId, 'quote_sent', 'Quote sent to client.', actor);
  revalidateCorporatePaths();
  return ok(undefined);
}

// ---------- markCostSheetAccepted ----------
// Same pattern: fetch from DB before merging.

export async function markCostSheetAccepted(bookingId: string): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Front Office', 'Admin'].includes(actor.role)) {
    return err('Insufficient permissions');
  }

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('cost_sheet')
    .eq('id', bookingId)
    .single();

  if (fetchErr || !booking) return err('Booking not found');

  const updatedCostSheet = {
    ...((booking['cost_sheet'] as CostSheet | null) ?? {}),
    acceptedAt: new Date().toISOString(),
    acceptedBy: actor.name,
  };

  const { error } = await supabase
    .from('bookings')
    .update({ corporate_stage: 'cost_sheet_accepted', cost_sheet: updatedCostSheet })
    .eq('id', bookingId);

  if (error) {
    console.error('[markCostSheetAccepted]', error);
    return err('Failed to mark cost sheet as accepted.');
  }

  await logCorporateActivity(supabase, bookingId, 'quote_accepted', 'Quote accepted by client.', actor);
  revalidateCorporatePaths();
  return ok(undefined);
}

// ---------- generateProformaInvoice ----------

export async function generateProformaInvoice(
  bookingId: string
): Promise<ActionResult<{ piNumber: string }>> {
  if (!bookingId) return err('Booking ID required');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Admin'].includes(actor.role)) {
    return err('Only Sales and Admin can generate proforma invoices');
  }

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('cost_sheet')
    .eq('id', bookingId)
    .single();

  if (fetchErr || !booking) return err('Booking not found');

  const costSheet = booking['cost_sheet'] as CostSheet | null;
  if (!costSheet?.lineItems?.length) {
    return err('Please add line items to the cost sheet before generating the proforma invoice.');
  }

  const piCounter = await getPiCounter(supabase);
  const newPiCounter = piCounter + 1;
  const piNumber = `BOR/${newPiCounter}`;
  const grandTotal = Number(costSheet.grandTotal ?? 0);
  const advanceRequired = Math.round(grandTotal * 0.5);

  const pi: ProformaInvoice = {
    piNumber,
    generatedAt: new Date().toISOString(),
    generatedBy: actor.name,
    lineItems: JSON.parse(JSON.stringify(costSheet.lineItems)) as LineItem[],
    grandTotal,
    advanceRequired,
    paymentTerms: '50% advance to confirm booking. Balance to be paid before checkout.',
    billingEntity: 'baghaan',
  };

  const { error } = await supabase
    .from('bookings')
    .update({ corporate_stage: 'pi_generated', proforma_invoice: pi })
    .eq('id', bookingId);

  if (error) {
    console.error('[generateProformaInvoice]', error);
    return err('Failed to generate proforma invoice.');
  }

  await supabase.from('meta').upsert({ key: 'pi_counter', value: String(newPiCounter) });

  await logCorporateActivity(supabase, bookingId, 'pi_generated', `Proforma invoice ${piNumber} generated — advance ₹${advanceRequired.toLocaleString('en-IN')} required.`, actor);
  revalidateCorporatePaths();
  return ok({ piNumber });
}

// ---------- createCorporateBooking ----------

export async function createCorporateBooking(input: {
  companyName: string;
  companyAddress: string;
  companyGST: string;
  contactName: string;
  contactNumber: string;
  contactEmail: string;
  arrival: string;
  departure: string;
  nights: number;
  rooms: string[];
  guestCount: { single: number; double: number; triple: number };
  remarks: string;
  addOns?: AddOn[];
  createdBy: string;
}): Promise<ActionResult<{ id: string; confirmationNumber: string }>> {
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Admin'].includes(actor.role)) {
    return err('Only Sales and Admin can create corporate bookings');
  }
  if (!isValidPhone(input.contactNumber)) return err(PHONE_ERROR);

  const { data: metaRow } = await supabase
    .from('meta')
    .select('value')
    .eq('key', 'booking_counter')
    .single();
  const counter = metaRow ? parseInt(metaRow.value as string) : 696;
  const newCounter = counter + 1;

  const { generateConfirmationNumber } = await import('@/lib/utils/booking');
  const confirmationNumber = generateConfirmationNumber(newCounter);
  const id = `BK-${Date.now()}`;
  const now = new Date().toISOString();

  const booking = {
    id,
    confirmation_number: confirmationNumber,
    guest_name: input.contactName || input.companyName,
    contact_number: normalizePhone(input.contactNumber),
    email: input.contactEmail || '',
    company_name: input.companyName,
    gst_number: '',
    arrival: input.arrival,
    departure: input.departure,
    nights: input.nights,
    adults: (input.guestCount.single + input.guestCount.double + input.guestCount.triple) || 1,
    children: 0,
    rooms: input.rooms,
    rate_breakdown: '',
    total_amount: 0,
    add_ons: input.addOns ?? [],
    advance_paid: 0,
    inclusions: '',
    remarks: input.remarks || '',
    special_requests: '',
    created_by: input.createdBy || actor.name,
    status: 'hold',
    hold_expires_at: null,
    final_bill: null,
    created_at: now,
    booking_type: 'corporate',
    corporate_stage: 'inquiry',
    company_address: input.companyAddress,
    company_gst: input.companyGST,
    contact_name: input.contactName,
    contact_email: input.contactEmail,
    guest_count: input.guestCount,
    cost_sheet: null,
    proforma_invoice: null,
    source_enquiry_id: null,
    guest_id: null,
  };

  const { error } = await supabase.from('bookings').insert(booking);
  if (error) {
    console.error('[createCorporateBooking]', error);
    return err('Failed to create corporate booking. Please try again.');
  }

  await supabase.from('meta').upsert({ key: 'booking_counter', value: String(newCounter) });
  await logCorporateActivity(supabase, id, 'inquiry_created', `Inquiry created for ${input.companyName}.`, actor);
  revalidateCorporatePaths();
  return ok({ id, confirmationNumber });
}

// ---------- check-in ----------

export async function checkInCorporate(bookingId: string): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Front Office', 'Sales', 'Sales Admin', 'Admin'].includes(actor.role)) return err('Insufficient permissions');

  const { data: row } = await supabase.from('bookings').select('corporate_stage, booking_type').eq('id', bookingId).single();
  if (!row || row['booking_type'] !== 'corporate') return err('Corporate booking not found');
  if (corporateStageStep(row['corporate_stage'] as string) < corporateStageStep('confirmed')) {
    return err('Booking must be confirmed before check-in.');
  }

  const { error } = await supabase.from('bookings').update({ corporate_stage: 'checked_in', status: 'checked_in' }).eq('id', bookingId);
  if (error) { console.error('[checkInCorporate]', error); return err('Failed to check in.'); }

  await logCorporateActivity(supabase, bookingId, 'checked_in', 'Guests checked in.', actor);
  revalidateCorporatePaths();
  return ok(undefined);
}

// ---------- complete ----------

export async function completeCorporate(bookingId: string): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Front Office', 'Sales', 'Sales Admin', 'Admin'].includes(actor.role)) return err('Insufficient permissions');

  const { data: row } = await supabase.from('bookings').select('corporate_stage, booking_type').eq('id', bookingId).single();
  if (!row || row['booking_type'] !== 'corporate') return err('Corporate booking not found');
  if (corporateStageStep(row['corporate_stage'] as string) < corporateStageStep('confirmed')) {
    return err('Only a confirmed booking can be completed.');
  }

  const { error } = await supabase.from('bookings').update({ corporate_stage: 'completed' }).eq('id', bookingId);
  if (error) { console.error('[completeCorporate]', error); return err('Failed to complete booking.'); }

  await logCorporateActivity(supabase, bookingId, 'completed', 'Booking marked completed.', actor);
  revalidateCorporatePaths();
  return ok(undefined);
}

// ---------- mark lost ----------
// A declined / dead corporate deal. Stored as status='cancelled' (frees the
// held rooms and drops it from the active pipeline); the reason is journaled to
// the activity log. Only allowed before the booking is confirmed — past that
// it's a cancellation, not a lost lead.

export async function markCorporateLost(bookingId: string, reason: string, note: string): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');
  if (!reason.trim()) return err('Please choose a reason.');
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Admin'].includes(actor.role)) return err('Only Sales and Admin can mark a deal lost');

  const { data: row } = await supabase.from('bookings').select('corporate_stage, booking_type, status').eq('id', bookingId).single();
  if (!row || row['booking_type'] !== 'corporate') return err('Corporate booking not found');
  if (row['status'] === 'cancelled') return err('This deal is already marked lost.');
  if (corporateStageStep(row['corporate_stage'] as string) >= corporateStageStep('confirmed')) {
    return err('A confirmed booking cannot be marked lost — cancel it instead.');
  }

  const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
  if (error) { console.error('[markCorporateLost]', error); return err('Failed to mark as lost.'); }

  const message = `Marked lost — ${reason.trim()}${note.trim() ? ` · ${note.trim()}` : ''}`;
  await logCorporateActivity(supabase, bookingId, 'lost', message, actor);
  revalidateCorporatePaths();
  return ok(undefined);
}

// ---------- admin stage override ----------
// Non-admins move the stage only through the normal workflow + automation.

export async function setCorporateStage(bookingId: string, stage: CorporateStage): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');
  if (!CORPORATE_STAGES[stage]) return err('Invalid stage');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (actor.role !== 'Admin') return err('Only Admin can override the stage');

  const { data: row } = await supabase.from('bookings').select('booking_type').eq('id', bookingId).single();
  if (!row || row['booking_type'] !== 'corporate') return err('Corporate booking not found');

  const update: Record<string, unknown> = { corporate_stage: stage };
  if (corporateStageStep(stage) >= corporateStageStep('confirmed')) {
    update['status'] = stage === 'checked_in' ? 'checked_in' : 'confirmed';
  }
  const { error } = await supabase.from('bookings').update(update).eq('id', bookingId);
  if (error) { console.error('[setCorporateStage]', error); return err('Failed to set stage.'); }

  await logCorporateActivity(supabase, bookingId, 'stage_override', `Stage manually set to "${CORPORATE_STAGES[stage].label}" by admin.`, actor);
  revalidateCorporatePaths();
  return ok(undefined);
}

// ---------- activity log ----------

export async function getCorporateActivity(bookingId: string): Promise<ActionResult<CorporateActivityEntry[]>> {
  if (!bookingId) return err('Booking ID required');
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');

  const { data } = await supabase
    .from('corporate_activity')
    .select('id, type, message, actor, created_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false });

  return ok((data ?? []).map(r => ({
    id: r['id'] as string,
    type: r['type'] as string,
    message: r['message'] as string,
    actor: r['actor'] as string,
    createdAt: r['created_at'] as string,
  })));
}
