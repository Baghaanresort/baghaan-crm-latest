# Enquiry Pipeline (SP1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the enquiry record drive the full pre-booking pipeline (BLOCK → PAY → VERIFY → BOOK) from inside the Enquiry tab, reusing the existing hold-booking + payments machinery.

**Architecture:** A "BLOCK ROOMS" action on an enquiry creates a `hold` booking stamped with `source_enquiry_id` and stored on `enquiries.held_booking_id`. The advance payment is recorded against that held booking via the existing `PaymentModal`/`addPayment`; Accounts verify it in the existing queue. Enquiry status is kept in sync by a single idempotent helper called from the payment actions (add/verify/unverify/delete). BOOK flips the held booking `hold → confirmed` (no new row), links it, and fires a `dispatchVoucher()` seam (SP1 logs only; SP2 sends). Enquiry-linked holds are hidden from the Bookings tab (they live in the Enquiry tab) but still show on the calendar.

**Tech Stack:** Next.js 16 App Router (React 19, server-first), Supabase (Postgres + RLS), Zod v4, react-hook-form-free local state, Tailwind v4, sonner. No test suite — **`npm run build` (strict TS) is the verification gate** for every task, plus the manual checks listed.

**Refinement vs. spec:** the spec described a `recordEnquiryAdvance` action. We instead reuse `PaymentModal` against the held booking and centralize enquiry-stage transitions in a `syncEnquiryStageFromPayment()` helper invoked by the payment actions. Same behaviour, less duplication, and it can't drift out of sync with manual payment edits.

**Conventions to follow (from CLAUDE.md):** every Server Action validates with a Zod schema, re-checks auth/role via the `getAuthedUser` helper, returns `ActionResult<T>` (`ok`/`err`, never throws), and `revalidatePath`s affected routes. All DB↔app crossings go through mappers. `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` are on, so index access is `T | undefined` and you must not assign `undefined` to optional props.

---

## Status key reference (use these exact values everywhere)

DB/code keys → UI labels:
- `new` → New
- `in_progress` → In Progress
- `rooms_blocked` → Rooms Blocked
- `advance_pending` → Advance Pending Verification
- `advance_confirmed` → Advance Payment Confirmed
- `booked` → Booked
- `lost` → Lost

---

## Task 1: Migration 007 — schema for the pipeline

**Files:**
- Create: `supabase/migrations/007_enquiry_pipeline.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- 007 — Enquiry pipeline (BLOCK → PAY → VERIFY → BOOK)
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- 1. Widen enquiry status to the 7-state pipeline.
ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS enquiries_status_check;
ALTER TABLE enquiries ADD CONSTRAINT enquiries_status_check
  CHECK (status IN (
    'new','in_progress','rooms_blocked',
    'advance_pending','advance_confirmed','booked','lost'
  ));

-- 2. In-flight hold link (distinct from linked_booking_id, which is the FINAL
--    Booked link used by the "↗ Converted" badge).
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS held_booking_id text;

-- 3. Partial index: find an enquiry's live hold quickly.
CREATE INDEX IF NOT EXISTS idx_bookings_source_enquiry_hold
  ON bookings (source_enquiry_id)
  WHERE status = 'hold' AND source_enquiry_id IS NOT NULL;

-- 4. Voucher dispatch log (SP1 logs intent; SP2 flips status to 'sent').
CREATE TABLE IF NOT EXISTS voucher_dispatches (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  booking_id  text NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  channel     text NOT NULL CHECK (channel IN ('email','whatsapp')),
  status      text NOT NULL DEFAULT 'logged' CHECK (status IN ('logged','sent','failed')),
  destination text NOT NULL DEFAULT '',
  detail      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voucher_dispatches_booking
  ON voucher_dispatches (booking_id, created_at DESC);
ALTER TABLE voucher_dispatches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voucher_dispatches_all" ON voucher_dispatches;
CREATE POLICY "voucher_dispatches_all" ON voucher_dispatches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Apply it**

Run the file's contents in the Supabase SQL Editor of the active instance
(`uopeetocjjictzjpvlew`). Per project history, migrations are applied by hand there.

- [ ] **Step 3: Verify in SQL Editor**

Run and confirm `held_booking_id` and the new constraint exist:
```sql
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'enquiries'::regclass AND conname = 'enquiries_status_check';
SELECT column_name FROM information_schema.columns
WHERE table_name='enquiries' AND column_name='held_booking_id';
SELECT table_name FROM information_schema.tables WHERE table_name='voucher_dispatches';
```
Expected: the CHECK lists all 7 statuses; one `held_booking_id` row; one `voucher_dispatches` row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/007_enquiry_pipeline.sql
git commit -m "feat(enquiries): migration 007 — pipeline statuses, held_booking_id, voucher_dispatches"
```

---

## Task 2: Types, mapper, validations, status constants

**Files:**
- Modify: `src/lib/types/enquiry.ts`
- Modify: `src/lib/mappers/enquiry.ts`
- Modify: `src/lib/validations/enquiry.ts`
- Modify: `src/lib/constants/enquiry.ts`

- [ ] **Step 1: Expand `EnquiryStatus` and add `heldBookingId`** (`src/lib/types/enquiry.ts`)

Replace the `EnquiryStatus` line and add the field to the `Enquiry` interface:
```ts
export type EnquiryStatus =
  | 'new'
  | 'in_progress'
  | 'rooms_blocked'
  | 'advance_pending'
  | 'advance_confirmed'
  | 'booked'
  | 'lost';
```
In `interface Enquiry`, add after `linkedBookingId`:
```ts
  heldBookingId: string | null;
```

- [ ] **Step 2: Map the new column** (`src/lib/mappers/enquiry.ts`)

In `dbToEnquiry`, add after the `linkedBookingId` line:
```ts
    heldBookingId: (row['held_booking_id'] as string | null) ?? null,
```
In `enquiryToDb`, add after the `linked_booking_id` line:
```ts
    held_booking_id: e.heldBookingId || null,
```

- [ ] **Step 3: Accept new statuses in Zod** (`src/lib/validations/enquiry.ts`)

Replace both `z.enum(['new', 'in_progress', 'booked', 'lost'])` occurrences (in
`EnquirySchema` and `UpdateEnquirySchema`) with:
```ts
z.enum(['new','in_progress','rooms_blocked','advance_pending','advance_confirmed','booked','lost'])
```
(Keep `.optional()` on the `UpdateEnquirySchema` one.)

- [ ] **Step 4: Add status display metadata** (`src/lib/constants/enquiry.ts`)

Add these three entries inside the `ENQUIRY_STATUSES` object (between `in_progress` and `booked`):
```ts
  rooms_blocked: { label: 'Rooms Blocked', color: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
  advance_pending: { label: 'Advance Pending Verification', color: 'bg-purple-100 text-purple-800', dot: 'bg-purple-500' },
  advance_confirmed: { label: 'Advance Payment Confirmed', color: 'bg-teal-100 text-teal-800', dot: 'bg-teal-600' },
```

- [ ] **Step 5: Verify**

Run: `npm run build`
Expected: PASS. The `ENQUIRY_STATUSES` `Record<EnquiryStatus, …>` will fail to compile if
any of the 7 keys is missing — that's the typecheck doing its job.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types/enquiry.ts src/lib/mappers/enquiry.ts src/lib/validations/enquiry.ts src/lib/constants/enquiry.ts
git commit -m "feat(enquiries): 7-status pipeline types, mapper, validation, constants"
```

---

## Task 3: Link holds to enquiries + hide them from the Bookings tab

**Files:**
- Modify: `src/lib/validations/booking.ts` (`BlockRoomSchema`)
- Modify: `src/lib/actions/bookings.ts` (`createBlockedRoom`)
- Modify: `src/lib/queries/bookings.ts` (`getBookings`)

- [ ] **Step 1: Add `sourceEnquiryId` to `BlockRoomSchema`** (`src/lib/validations/booking.ts`)

Inside the `BlockRoomSchema` object (before the closing `})` / `.refine`), add:
```ts
    sourceEnquiryId: z.string().nullable().optional(),
```

- [ ] **Step 2: Persist it in `createBlockedRoom`** (`src/lib/actions/bookings.ts`)

In the `booking` object built inside `createBlockedRoom`, change the
`sourceEnquiryId: null,` line to:
```ts
    sourceEnquiryId: parsed.data.sourceEnquiryId ?? null,
```

- [ ] **Step 3: Hide enquiry-linked holds from the Bookings list** (`src/lib/queries/bookings.ts`)

Replace the body of `getBookings` with:
```ts
export async function getBookings(): Promise<Booking[]> {
  const supabase = await createClient();
  // Enquiry-driven holds live in the Enquiry tab until they're booked. Keep rows
  // where status != 'hold' OR there's no linked enquiry. (At BOOK the hold becomes
  // 'confirmed', so it surfaces here naturally.)
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .or('status.neq.hold,source_enquiry_id.is.null')
    .order('created_at', { ascending: false });
  return (data ?? []).map(dbToBooking);
}
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: PASS.
Manual: not testable until UI lands — confirmed end-to-end in Task 9.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/booking.ts src/lib/actions/bookings.ts src/lib/queries/bookings.ts
git commit -m "feat(enquiries): stamp source_enquiry_id on holds; hide enquiry holds from Bookings list"
```

---

## Task 4: Payment-driven enquiry stage sync

A held booking's payment state determines the enquiry stage. One idempotent helper,
called from every payment mutation, keeps them aligned.

**Files:**
- Modify: `src/lib/actions/payments.ts`

- [ ] **Step 1: Add the sync helper** (`src/lib/actions/payments.ts`)

Add near the top, after `onPaymentVerified`:
```ts
// Keep an enquiry's stage in lock-step with its held booking's payments.
// Idempotent: recomputes purely from current payment rows, so add/verify/unverify/
// delete all converge correctly. No-op for bookings with no source enquiry.
async function syncEnquiryStageFromPayment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
): Promise<void> {
  const { data: b } = await supabase
    .from('bookings')
    .select('source_enquiry_id, status')
    .eq('id', bookingId)
    .single();

  const enquiryId = b?.['source_enquiry_id'] as string | null;
  if (!enquiryId) return;
  // Once the booking is confirmed (Booked), payment edits don't move the enquiry.
  if (b?.['status'] !== 'hold') return;

  const { data: pays } = await supabase
    .from('payments')
    .select('verified, type')
    .eq('booking_id', bookingId);

  const advances = (pays ?? []).filter(p => p['type'] === 'advance');
  const hasVerified = advances.some(p => p['verified'] === true);
  const hasAny = advances.length > 0;

  const stage = hasVerified ? 'advance_confirmed' : hasAny ? 'advance_pending' : 'rooms_blocked';

  await supabase
    .from('enquiries')
    .update({ status: stage, updated_at: new Date().toISOString() })
    .eq('id', enquiryId)
    .eq('held_booking_id', bookingId); // guard: only the live hold
  revalidatePath('/enquiries');
}
```

- [ ] **Step 2: Call it from the four payment mutations** (`src/lib/actions/payments.ts`)

- In `addPayment`, immediately before `revalidatePaymentPaths();` (the final one), add:
```ts
  await syncEnquiryStageFromPayment(supabase, payment.bookingId);
```
- In `verifyPayment`, after the `if (pay?.['booking_id']) { … }` block and before
  `revalidatePaymentPaths();`, add:
```ts
  if (pay?.['booking_id']) await syncEnquiryStageFromPayment(supabase, pay['booking_id'] as string);
```
- In `unverifyPayment`: it currently doesn't fetch the booking id. Add a fetch at the top
  of the function (after the role check) and a sync before `revalidatePaymentPaths();`:
```ts
  const { data: pay } = await supabase.from('payments').select('booking_id').eq('id', paymentId).single();
```
```ts
  if (pay?.['booking_id']) await syncEnquiryStageFromPayment(supabase, pay['booking_id'] as string);
```
- In `deletePayment`: capture the booking id BEFORE deleting, then sync AFTER. Add before
  the delete:
```ts
  const { data: pay } = await supabase.from('payments').select('booking_id').eq('id', paymentId).single();
```
  and after a successful delete, before `revalidatePaymentPaths();`:
```ts
  if (pay?.['booking_id']) await syncEnquiryStageFromPayment(supabase, pay['booking_id'] as string);
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/payments.ts
git commit -m "feat(enquiries): sync enquiry stage from held-booking payments (add/verify/unverify/delete)"
```

---

## Task 5: Enquiry actions — block, book, release + lazy expiry

**Files:**
- Modify: `src/lib/actions/enquiries.ts`
- Create: `src/lib/validations/enquiry-block.ts`

- [ ] **Step 1: Block-input schema** (`src/lib/validations/enquiry-block.ts`)

```ts
import { z } from 'zod';

export const EnquiryBlockSchema = z
  .object({
    arrival: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
    departure: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
    nights: z.number().int().min(1),
    adults: z.number().int().min(1),
    children: z.number().int().min(0),
    rooms: z.array(z.string()).min(1, 'Select at least one room to block'),
    quotedAmount: z.number().min(0).optional().default(0),
    notes: z.string().optional().default(''),
    holdExpiresAt: z.string().nullable().optional(),
  })
  .refine((d) => d.departure > d.arrival, { message: 'Departure must be after arrival', path: ['departure'] });

export type EnquiryBlockInput = z.infer<typeof EnquiryBlockSchema>;
```

- [ ] **Step 2: Add imports** at the top of `src/lib/actions/enquiries.ts`

```ts
import { createBlockedRoom } from '@/lib/actions/bookings';
import { dispatchVoucher } from '@/lib/actions/dispatch';
import { EnquiryBlockSchema } from '@/lib/validations/enquiry-block';
```
(`dispatchVoucher` is created in Task 6 — implement Task 6 before building.)

- [ ] **Step 3: `blockEnquiryRooms`** — append to `src/lib/actions/enquiries.ts`

```ts
export async function blockEnquiryRooms(
  enquiryId: string,
  input: z.infer<typeof EnquiryBlockSchema>,
): Promise<ActionResult<{ bookingId: string; confirmationNumber: string }>> {
  if (!enquiryId) return err('Enquiry ID required');
  const parsed = EnquiryBlockSchema.safeParse(input);
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Validation failed');

  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Admin'].includes(actor.role)) return err('Only Sales and Admin can block rooms');

  const { data: enq } = await supabase
    .from('enquiries').select('name, phone, status, held_booking_id').eq('id', enquiryId).single();
  if (!enq) return err('Enquiry not found');
  if (enq['held_booking_id']) return err('This enquiry already has blocked rooms.');
  if (!['new', 'in_progress'].includes(enq['status'] as string)) {
    return err('Rooms can only be blocked from a New or In Progress lead.');
  }

  // Reuse the hold-booking creator; it runs checkRoomConflict and stamps the back-link.
  const blockRes = await createBlockedRoom({
    guestName: (enq['name'] as string) || 'Enquiry guest',
    contactNumber: (enq['phone'] as string) || '',
    arrival: parsed.data.arrival,
    departure: parsed.data.departure,
    nights: parsed.data.nights,
    adults: parsed.data.adults,
    children: parsed.data.children,
    rooms: parsed.data.rooms,
    quotedAmount: parsed.data.quotedAmount ?? 0,
    notes: parsed.data.notes ?? '',
    createdBy: actor.name,
    holdExpiresAt: parsed.data.holdExpiresAt ?? null,
    sourceEnquiryId: enquiryId,
  });
  if (!blockRes.success) return err(blockRes.error);

  const now = new Date().toISOString();
  const { error } = await supabase.from('enquiries').update({
    status: 'rooms_blocked',
    held_booking_id: blockRes.data.id,
    next_action: `Rooms blocked · ${blockRes.data.confirmationNumber}`,
    updated_by: actor.name,
    updated_at: now,
  }).eq('id', enquiryId);
  if (error) { console.error('[blockEnquiryRooms]', error); return err('Failed to block rooms.'); }

  await supabase.from('enquiry_activities').insert({
    id: `ACT-${Date.now()}-b`, enquiry_id: enquiryId, type: 'note',
    note: `Rooms blocked: ${parsed.data.rooms.length} room(s), ${parsed.data.arrival}→${parsed.data.departure}`,
    created_by: actor.name, created_at: now,
  });

  revalidateEnquiryPaths();
  revalidatePath('/calendar');
  return ok({ bookingId: blockRes.data.id, confirmationNumber: blockRes.data.confirmationNumber });
}
```

- [ ] **Step 4: `releaseEnquiryHold`** — append to `src/lib/actions/enquiries.ts`

```ts
export async function releaseEnquiryHold(enquiryId: string): Promise<ActionResult> {
  if (!enquiryId) return err('Enquiry ID required');
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Admin'].includes(actor.role)) return err('Only Sales and Admin can release holds');

  const { data: enq } = await supabase
    .from('enquiries').select('held_booking_id, status').eq('id', enquiryId).single();
  if (!enq?.['held_booking_id']) return err('No active hold on this enquiry.');
  if (enq['status'] === 'booked') return err('This enquiry is already booked.');

  const now = new Date().toISOString();
  // Cancel the hold booking (keeps the record; frees the rooms from conflict checks
  // because checkRoomConflict ignores cancelled bookings).
  await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', enq['held_booking_id'] as string);
  const { error } = await supabase.from('enquiries').update({
    status: 'in_progress', held_booking_id: null, next_action: 'Hold released',
    updated_by: actor.name, updated_at: now,
  }).eq('id', enquiryId);
  if (error) { console.error('[releaseEnquiryHold]', error); return err('Failed to release hold.'); }

  await supabase.from('enquiry_activities').insert({
    id: `ACT-${Date.now()}-r`, enquiry_id: enquiryId, type: 'note',
    note: 'Room hold released', created_by: actor.name, created_at: now,
  });

  revalidateEnquiryPaths();
  revalidatePath('/calendar');
  revalidatePath('/bookings');
  return ok(undefined);
}
```

> **Confirm before building:** `checkRoomConflict` must ignore `cancelled` bookings for the
> release above to actually free rooms. Open `src/lib/utils/conflict.ts` and verify the
> query filters out `status = 'cancelled'`. If it does not, add `.neq('status','cancelled')`
> to that query as part of this step (and re-verify with `npm run build`).

- [ ] **Step 5: `bookEnquiry`** — append to `src/lib/actions/enquiries.ts`

```ts
export async function bookEnquiry(
  enquiryId: string,
): Promise<ActionResult<{ bookingId: string; confirmationNumber: string }>> {
  if (!enquiryId) return err('Enquiry ID required');
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Admin'].includes(actor.role)) return err('Only Sales and Admin can book');

  const { data: enq } = await supabase
    .from('enquiries').select('held_booking_id, status').eq('id', enquiryId).single();
  if (!enq) return err('Enquiry not found');
  if (enq['status'] !== 'advance_confirmed') {
    return err('A verified advance payment is required before booking.');
  }
  const bookingId = enq['held_booking_id'] as string | null;
  if (!bookingId) return err('No held booking found for this enquiry.');

  const { data: bk } = await supabase
    .from('bookings').select('confirmation_number, status').eq('id', bookingId).single();
  if (!bk) return err('Held booking missing.');
  if (bk['status'] !== 'hold') return err('Held booking is no longer holdable.');

  const now = new Date().toISOString();
  // Reuse the held record: hold → confirmed is the moment it enters the Bookings tab.
  const { error: upBk } = await supabase
    .from('bookings').update({ status: 'confirmed', hold_expires_at: null }).eq('id', bookingId);
  if (upBk) { console.error('[bookEnquiry booking]', upBk); return err('Failed to confirm booking.'); }

  const confirmationNumber = bk['confirmation_number'] as string;
  const { error: upEnq } = await supabase.from('enquiries').update({
    status: 'booked', linked_booking_id: bookingId, followup_date: null,
    next_action: `Booking confirmed · ${confirmationNumber}`,
    updated_by: actor.name, updated_at: now,
  }).eq('id', enquiryId);
  if (upEnq) { console.error('[bookEnquiry enquiry]', upEnq); return err('Booking confirmed but linking failed.'); }

  await supabase.from('enquiry_activities').insert({
    id: `ACT-${Date.now()}-bk`, enquiry_id: enquiryId, type: 'booking_created',
    note: `Converted to booking ${confirmationNumber}`, created_by: actor.name, created_at: now,
  });

  // Dispatch seam — SP1 logs intent; SP2 actually sends.
  await dispatchVoucher(bookingId);

  revalidateEnquiryPaths();
  revalidatePath('/bookings');
  revalidatePath('/calendar');
  revalidatePath('/vouchers');
  return ok({ bookingId, confirmationNumber });
}
```

- [ ] **Step 6: Lazy expiry helper** — append to `src/lib/actions/enquiries.ts`

```ts
// Release enquiry-linked holds whose expiry has passed. Called (fire-and-forget) from
// the enquiries page load. Idempotent and cheap: one indexed query + bounded updates.
export async function releaseExpiredEnquiryHolds(): Promise<void> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const { data: expired } = await supabase
    .from('bookings')
    .select('id, source_enquiry_id')
    .eq('status', 'hold')
    .not('source_enquiry_id', 'is', null)
    .not('hold_expires_at', 'is', null)
    .lt('hold_expires_at', nowIso);

  for (const b of expired ?? []) {
    const bookingId = b['id'] as string;
    const enquiryId = b['source_enquiry_id'] as string;
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
    await supabase.from('enquiries').update({
      status: 'in_progress', held_booking_id: null,
      next_action: 'Hold expired — rooms released', updated_at: nowIso,
    }).eq('id', enquiryId).eq('held_booking_id', bookingId);
    await supabase.from('enquiry_activities').insert({
      id: `ACT-${Date.now()}-x-${bookingId.slice(-4)}`, enquiry_id: enquiryId, type: 'note',
      note: 'Hold expired automatically; rooms released', created_by: 'system', created_at: nowIso,
    });
  }
}
```

- [ ] **Step 7: Verify**

Run: `npm run build`
Expected: PASS. (Will fail to resolve `dispatchVoucher` until Task 6 — do Task 6 first or
together; commit both once green.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/actions/enquiries.ts src/lib/validations/enquiry-block.ts
git commit -m "feat(enquiries): block/book/release actions + lazy hold expiry"
```

---

## Task 6: `dispatchVoucher()` seam (SP1 = log only)

**Files:**
- Create: `src/lib/actions/dispatch.ts`

- [ ] **Step 1: Implement the seam**

```ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';

/**
 * Voucher dispatch seam. SP1 records dispatch INTENT (status 'logged') for the email
 * and WhatsApp channels so the Vouchers tab can show it. SP2 replaces the body with
 * real Resend (email) + WhatsApp BSP sends and sets status 'sent'/'failed'. The
 * signature is stable so callers (bookEnquiry) never change.
 */
export async function dispatchVoucher(bookingId: string): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');
  const supabase = await createClient();

  const { data: bk } = await supabase
    .from('bookings').select('email, contact_number').eq('id', bookingId).single();
  if (!bk) return err('Booking not found');

  const now = new Date().toISOString();
  const rows = [
    { channel: 'email', destination: (bk['email'] as string) || '' },
    { channel: 'whatsapp', destination: (bk['contact_number'] as string) || '' },
  ].map((r, i) => ({
    id: `VD-${Date.now()}-${i}`,
    booking_id: bookingId,
    channel: r.channel,
    status: 'logged',
    destination: r.destination,
    detail: 'SP1: dispatch logged (sending not yet enabled)',
    created_at: now,
  }));

  const { error } = await supabase.from('voucher_dispatches').insert(rows);
  if (error) { console.error('[dispatchVoucher]', error); return err('Failed to log voucher dispatch.'); }
  return ok(undefined);
}
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/dispatch.ts
git commit -m "feat(vouchers): dispatchVoucher seam — logs email/whatsapp intent (SP1)"
```

---

## Task 7: Enquiries page loads held bookings + their payments

The client needs the held booking (for the Block summary + to pass to `PaymentModal`) and
its payments (for the PAY button's "already paid" state).

**Files:**
- Modify: `src/app/(app)/enquiries/page.tsx`

- [ ] **Step 1: Fetch holds + payments and run lazy expiry** (`src/app/(app)/enquiries/page.tsx`)

Replace the body after the profile guard with:
```tsx
  // Release any expired holds before reading the list, so stages are current.
  const { releaseExpiredEnquiryHolds } = await import('@/lib/actions/enquiries');
  await releaseExpiredEnquiryHolds();

  const [enquiries, usersData] = await Promise.all([
    getEnquiries(),
    supabase.from('profiles').select('name, role').in('role', ['Admin', 'Sales', 'Accounts', 'Front Office']),
  ]);

  // Pull the held bookings + their payments for in-flight enquiries (one round trip each).
  const heldIds = enquiries.map(e => e.heldBookingId).filter((x): x is string => !!x);
  const [heldBookingsRes, heldPaymentsRes] = await Promise.all([
    heldIds.length ? supabase.from('bookings').select('*').in('id', heldIds) : Promise.resolve({ data: [] }),
    heldIds.length ? supabase.from('payments').select('*').in('booking_id', heldIds) : Promise.resolve({ data: [] }),
  ]);

  const heldBookings = (heldBookingsRes.data ?? []).map(dbToBooking);
  const heldPayments = (heldPaymentsRes.data ?? []).map(dbToPayment);

  return (
    <EnquiriesClient
      initialEnquiries={enquiries}
      heldBookings={heldBookings}
      heldPayments={heldPayments}
      users={(usersData.data ?? []) as Array<{ name: string; role: string }>}
      currentUser={{ id: user.id, name: profile.name as string, role: profile.role as UserRole }}
    />
  );
```
Add imports at the top (only the mappers — the arrays infer their types, so no unused
type imports that would trip Next's ESLint build step):
```tsx
import { dbToBooking } from '@/lib/mappers/booking';
import { dbToPayment } from '@/lib/mappers/payment';
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: FAIL — `EnquiriesClient` doesn't yet accept `heldBookings`/`heldPayments`. That's
expected; Task 8 adds the props. (If you want a green build between tasks, do Step 1 of Task 8
first, then this.)

- [ ] **Step 3: Commit** (after Task 8 compiles, commit together)

---

## Task 8: Enquiry-tab UI — Block modal, Pay modal, status-driven actions

**Files:**
- Modify: `src/components/bookings/BlockModal.tsx` (add optional enquiry mode)
- Modify: `src/app/(app)/enquiries/EnquiriesClient.tsx`

- [ ] **Step 1: Teach `BlockModal` an enquiry mode** (`src/components/bookings/BlockModal.tsx`)

Add to `Props`:
```ts
  enquiry?: { id: string; name: string; phone: string };
  onBlocked?: () => void;
```
Add the import:
```ts
import { blockEnquiryRooms } from '@/lib/actions/enquiries';
```
In `handleSave`, in the **create** branch (the `else` that calls `createBlockedRoom`),
branch on enquiry mode first:
```ts
      } else if (enquiry) {
        const result = await blockEnquiryRooms(enquiry.id, {
          arrival: form.arrival, departure: form.departure, nights: form.nights,
          adults: form.adults, children: form.children, rooms: form.rooms,
          quotedAmount: quoted, notes: form.notes, holdExpiresAt: form.holdExpiresAt || null,
        });
        if (!result.success) { toast.error(result.error); return; }
        toast.success(`Rooms blocked: ${result.data.confirmationNumber}`);
        onBlocked?.();
      } else {
        const result = await createBlockedRoom({ ...form, quotedAmount: quoted, createdBy: currentUser.name });
        if (!result.success) { toast.error(result.error); return; }
        toast.success(`Rooms blocked: ${result.data.confirmationNumber}`);
      }
```
When opened in enquiry mode, prefill guest name/phone: change the `useState` defaults for
`guestName`/`contactNumber` to also accept the enquiry — simplest is to seed via the existing
`booking?` path, so instead pass initial values. Add at the top of the component:
```ts
  const seedName = booking?.guestName ?? enquiry?.name ?? '';
  const seedPhone = booking?.contactNumber ?? enquiry?.phone ?? '';
```
and use `seedName`/`seedPhone` in the `form` initial state for those two fields.

- [ ] **Step 2: Update `EnquiriesClient` props + imports** (`src/app/(app)/enquiries/EnquiriesClient.tsx`)

Extend `Props`:
```ts
  heldBookings: import('@/lib/types/booking').Booking[];
  heldPayments: import('@/lib/types/payment').Payment[];
```
Add imports:
```ts
import { bookEnquiry, releaseEnquiryHold } from '@/lib/actions/enquiries';
import { BlockModal } from '@/components/bookings/BlockModal';
import { PaymentModal } from '@/components/payments/PaymentModal';
```
Destructure the new props in the function signature and add lookup maps + modal state:
```ts
  const heldById = useMemo(() => new Map(heldBookings.map(b => [b.id, b])), [heldBookings]);
  const paysByBooking = useMemo(() => {
    const m = new Map<string, typeof heldPayments>();
    for (const p of heldPayments) m.set(p.bookingId, [...(m.get(p.bookingId) ?? []), p]);
    return m;
  }, [heldPayments]);
  const [blockFor, setBlockFor] = useState<Enquiry | null>(null);
  const [payFor, setPayFor] = useState<Enquiry | null>(null);
```

- [ ] **Step 3: Add action handlers** (`EnquiriesClient.tsx`)

```ts
  const handleBook = (e: Enquiry) => {
    startTransition(async () => {
      const result = await bookEnquiry(e.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(`Booked · ${result.data.confirmationNumber}`);
      router.refresh();
    });
  };
  const handleRelease = (e: Enquiry) => {
    startTransition(async () => {
      const result = await releaseEnquiryHold(e.id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success('Hold released');
      router.refresh();
    });
  };
```

- [ ] **Step 4: Replace the row action buttons** with status-driven controls (`EnquiriesClient.tsx`)

Inside the `(isSales || isAdmin)` block of the Actions cell, replace the current
`Convert →` / `Lost` buttons with:
```tsx
                            {(e.status === 'new' || e.status === 'in_progress') && (
                              <button onClick={() => setBlockFor(e)} disabled={isPending}
                                className="text-xs border border-amber-500 px-2 py-1 hover:bg-amber-50 text-amber-700 disabled:opacity-50 whitespace-nowrap">
                                Block Rooms
                              </button>
                            )}
                            {e.status === 'rooms_blocked' && (
                              <>
                                <button onClick={() => setPayFor(e)} disabled={isPending}
                                  className="text-xs border border-purple-500 px-2 py-1 hover:bg-purple-50 text-purple-700 disabled:opacity-50">
                                  Pay
                                </button>
                                <button onClick={() => handleRelease(e)} disabled={isPending}
                                  className="text-xs border border-stone-300 px-2 py-1 hover:bg-stone-100 text-stone-600 disabled:opacity-50">
                                  Release
                                </button>
                              </>
                            )}
                            {e.status === 'advance_pending' && (
                              <span className="text-xs text-purple-600 italic px-2 py-1">Awaiting Accounts</span>
                            )}
                            {e.status === 'advance_confirmed' && (
                              <button onClick={() => handleBook(e)} disabled={isPending}
                                className="text-xs border border-emerald-600 px-2 py-1 hover:bg-emerald-50 text-emerald-700 disabled:opacity-50 whitespace-nowrap">
                                Book →
                              </button>
                            )}
                            {e.status !== 'lost' && e.status !== 'booked' && e.status !== 'advance_pending' && e.status !== 'advance_confirmed' && (
                              <button onClick={() => handleQuickStatus(e, 'lost')}
                                className="text-xs border border-red-200 px-2 py-1 hover:bg-red-50 text-red-600">
                                Lost
                              </button>
                            )}
```
(Keep the existing View + WhatsApp + Edit icon buttons as-is.)

- [ ] **Step 5: Render the modals** at the bottom, alongside the existing modals (`EnquiriesClient.tsx`)

```tsx
      {blockFor && (
        <BlockModal
          currentUser={currentUser}
          existingBookings={heldBookings}
          enquiry={{ id: blockFor.id, name: blockFor.name, phone: blockFor.phone }}
          onBlocked={() => { setBlockFor(null); router.refresh(); }}
          onClose={() => setBlockFor(null)}
        />
      )}
      {payFor && payFor.heldBookingId && heldById.get(payFor.heldBookingId) && (
        <PaymentModal
          booking={heldById.get(payFor.heldBookingId)!}
          payments={paysByBooking.get(payFor.heldBookingId) ?? []}
          currentUser={currentUser}
          onClose={() => { setPayFor(null); router.refresh(); }}
        />
      )}
```
> Note: `BlockModal`'s `existingBookings` is used only to grey out already-taken rooms.
> Passing `heldBookings` covers enquiry holds; for full occupancy accuracy the modal relies
> on the server's `checkRoomConflict` anyway (the authoritative gate), so this is sufficient.

- [ ] **Step 6: Verify**

Run: `npm run build`
Expected: PASS (this is where Task 7's page changes also compile).

- [ ] **Step 7: Commit**

```bash
git add src/app/(app)/enquiries/page.tsx src/app/(app)/enquiries/EnquiriesClient.tsx src/components/bookings/BlockModal.tsx
git commit -m "feat(enquiries): Block/Pay/Book/Release actions in the Enquiry tab"
```

---

## Task 9: End-to-end manual verification

No automated tests exist; verify the full pipeline by hand against the running dev server.

- [ ] **Step 1: Build is clean**

Run: `npm run build`
Expected: PASS, no type errors.

- [ ] **Step 2: Walk the happy path** (logged in as Admin or Sales)

1. Create an enquiry → status **New**.
2. **Block Rooms** (pick rooms, 24h expiry, quoted amount) → status **Rooms Blocked**;
   open `/calendar` and confirm the rooms show amber for those dates; open `/bookings` and
   confirm the hold does **not** appear in the list.
3. **Pay** (record an advance, e.g. mode UPI) → status **Advance Pending Verification**;
   open `/accounts` and confirm the payment is in the verification queue.
4. As **Accounts**, **Verify** the payment → re-open `/enquiries`, the enquiry is now
   **Advance Payment Confirmed**.
5. As Sales/Admin, **Book →** → status **Booked**; `/bookings` now shows the booking as
   `confirmed`; `voucher_dispatches` has two rows (`email`, `whatsapp`, status `logged`) for
   that booking id.

- [ ] **Step 3: Walk the expiry path**

1. Block rooms on a fresh enquiry with a near-past expiry (or set `hold_expires_at` to the
   past via SQL).
2. Reload `/enquiries` → the enquiry reverts to **In Progress**, `held_booking_id` is null,
   the hold booking is `cancelled`, and an activity note records the auto-release.
3. Confirm those rooms are bookable again (no conflict) on `/calendar` / a new block.

- [ ] **Step 4: Walk the rejection path**

1. From a **Rooms Blocked** enquiry, **Pay** → Advance Pending.
2. As Accounts, **delete/reject** the payment → enquiry returns to **Rooms Blocked** and the
   **Pay** button is active again.

- [ ] **Step 5: Commit any fixes, then summarize**

```bash
git add -A
git commit -m "test(enquiries): manual E2E pass for the BLOCK→PAY→VERIFY→BOOK pipeline"
```

---

## Coverage check (plan ↔ spec §4–6)

- 7 statuses + transitions → Tasks 1,2,4,5,8
- BLOCK within Enquiry tab + modal (dates/rooms/expiry/quote) → Tasks 5,8
- PAY within Enquiry tab + greys out after one payment → Tasks 4,8 (PaymentModal already
  shows existing payments / disables on submit)
- VERIFY auto-advances enquiry → Task 4
- BOOK reuses hold→confirmed, links, fires dispatch → Tasks 5,6
- Hold expiry (lazy) + manual release → Task 5,7
- Bookings tab hides enquiry holds; calendar shows them → Task 3
- Keep standalone Bookings "Block Rooms" → untouched (Task 3 only adds an optional field)
- Voucher dispatch logged (not sent) → Task 6 (SP2 will replace the seam body)

## Deferred to SP2 (separate plan)
Real Resend email send + WhatsApp BSP send behind `dispatchVoucher()`; Vouchers-tab UI to
display dispatch rows with sent/failed timestamps; env keys + WhatsApp template approval.
