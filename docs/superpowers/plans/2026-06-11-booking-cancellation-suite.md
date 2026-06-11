# Booking Cancellation Suite — Design Reference

**Date:** 2026-06-11
**Status:** Reference only — DO NOT implement until explicitly asked.
**Scope:** Professional resort-CRM cancellation handling for regular bookings.

Builds on the already-shipped soft-cancel (`cancelBooking`). Item 1 is done; 2–5 layer on top.

---

## ✅ 1. Cancel Booking — DONE
`cancelBooking` (`src/lib/actions/bookings.ts`) soft-voids a booking: `status → 'cancelled'`,
frees rooms (conflict-checker ignores cancelled), journals to `booking_history`. Sales/Admin
only; corporate excluded. UI: "Cancel" (Ban icon) button + grey "Cancelled" badge + Cancelled
filter tab in `BookingsClient.tsx`.

## 2. Cancellation reason
- **Migration:** add `cancellation_reason text`, `cancelled_by text`, `cancelled_at timestamptz` to `bookings`.
- **UI:** replace the plain `confirm()` with a small modal (reuse the enquiry "Mark Lost" dialog pattern in `EnquiriesClient.tsx`). Dropdown: Guest request · Date change · Payment not received · Duplicate · Overbooking · Other (free text).
- **Action:** `cancelBooking(id, reason)` persists reason + includes it in the history entry.
- **Display:** reason on the cancelled row (tooltip) + in the history timeline.

## 3. Refund tracking
- **Decision needed:** reuse `payments` with `type: 'refund'` (recommended — single ledger) vs. a new `refunds` table.
- **Fields:** amount, mode, date, reference, status (`pending` / `processed`).
- **Flow:** cancelling a booking with verified payments prompts "record refund?" → creates refund row; Accounts marks processed.
- **Display:** "Refunded ₹X" on the booking; nets against totals.

## 4. No-show status
- **Migration:** add `no_show` to the booking status check constraint.
- **Distinct from cancel:** booking was real, guest never arrived — typically non-refundable, room not freed retroactively.
- **Action + UI:** "Mark No-Show" (Front Office/Admin), only for `confirmed` bookings past arrival and not checked in. Grey "No-Show" badge + own filter tab.

## 5. Audit / activity log
- **Partly exists:** `booking_history` table + cancel journaling. Gaps: no viewer UI; not every action journals.
- **Add:** per-booking history timeline modal (who/what/when); ensure cancel, no-show, refund, and edits all journal consistently.

---

## Suggested build order
1 (done) → 5 (history viewer first, so later actions are auditable) → 2 (reason) → 4 (no-show) → 3 (refunds, most involved).

## Open decisions
- Refunds: reuse `payments` ledger or separate `refunds` table?
- No-show: auto-flag past-arrival un-checked-in bookings, or manual only?

## Verification gate
No test suite — `npm run build` (strict TS) is the gate for every step, plus manual checks per feature.
