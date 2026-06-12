# Require a total amount in the enquiry pipeline

**Date:** 2026-06-12
**Status:** Approved — ready for implementation plan

## Problem

A guest can reach a **confirmed booking with a dispatched voucher and `totalAmount = ₹0`** through the enquiry pipeline (BLOCK → PAY → VERIFY → BOOK).

The package total is captured in exactly one place in the whole pipeline: the **optional** "Quoted Amount" field at BLOCK time (`BlockModal.tsx`, `blockEnquiryRooms` in `src/lib/actions/enquiries.ts`). If sales blocks rooms without a quote — normal, because the guest hasn't committed yet — then:

- **PAY** records the advance (the payment's own `amount`) but never touches the booking's package `totalAmount`.
- **VERIFY** only flips the payment's `verified` flag → stage `advance_confirmed`.
- **BOOK** (`bookEnquiry`, `src/lib/actions/enquiries.ts:381`) flips the held booking `hold → confirmed` and calls `dispatchVoucher` — **without ever setting or checking `totalAmount`.**

Net: an advance gets taken and a voucher goes out against a ₹0 booking. This path is worse than the regular `BookingModal`, which at least *shows* a Total field (also unguarded, but that's a separate fix).

## Decision

Capture the total at **PAY, required**: an advance cannot be logged against an enquiry hold that has no package total. An advance is a slice of a known total, so this is the natural, lowest-friction place. BLOCK's quote stays optional. BOOK gets a server-side safety net.

## Changes

### 1. PAY — capture the total (primary surface)

In the payment flow for an **enquiry-linked hold** (booking has `source_enquiry_id` set and `status = 'hold'`):

- Show a **"Total Package Amount (₹)"** field, prefilled from the hold's existing `totalAmount` (the BLOCK quote, if any).
- If the total is still `0`, **require it** before the advance can be saved.
- On save, write the value back to the booking's `totalAmount`.
- **Scope guard:** this requirement only applies to enquiry holds with no total. Regular and corporate bookings already carry a total (corporate derives it from the cost sheet/PI), so normal payments are unaffected.

### 2. BOOK — server-side safety net

In `bookEnquiry` (`src/lib/actions/enquiries.ts:381`), before flipping `hold → confirmed` and dispatching the voucher:

- **Reject if `totalAmount <= 0`** with a clear message (e.g. "Add the total package amount before booking").
- Cheap guard; follows the project rule that every check is re-implemented server-side in the action. Also catches any legacy hold created before change #1.

### 3. BLOCK — unchanged

Quote stays optional. A hold is tentative; we do not force a price at block time. Stated explicitly so it is not "fixed" by mistake.

## Why this shape

- One real UI touch point (PAY) and one server guard (BOOK). No new prompt modal at BOOK, because PAY guarantees the total is present.
- `totalAmount` is guaranteed `> 0` by the time the voucher is dispatched — closes the ₹0-voucher hole.
- Consistent with the agreed principle for the regular modal: enforce at the money-committed moment, not before.

## Out of scope

- Requiring a total in the regular `BookingModal` — a separate, parallel fix discussed but not part of this plan.
- Advance-cannot-exceed-total validation — could be added later; deliberately omitted here to keep scope tight.
