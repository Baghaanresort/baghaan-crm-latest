'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import type { CostSheet, LineItem, ProformaInvoice } from '@/lib/types/booking';

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
  if (!['Sales', 'Front Office', 'Admin'].includes(actor.role)) {
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
  if (!['Sales', 'Front Office', 'Admin'].includes(actor.role)) {
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
  if (!['Sales', 'Front Office', 'Admin'].includes(actor.role)) {
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
  if (!['Sales', 'Admin'].includes(actor.role)) {
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
  createdBy: string;
}): Promise<ActionResult<{ id: string; confirmationNumber: string }>> {
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Admin'].includes(actor.role)) {
    return err('Only Sales and Admin can create corporate bookings');
  }

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
    contact_number: input.contactNumber,
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
  revalidateCorporatePaths();
  return ok({ id, confirmationNumber });
}
