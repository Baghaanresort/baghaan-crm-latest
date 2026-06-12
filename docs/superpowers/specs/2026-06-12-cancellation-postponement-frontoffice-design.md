# Cancellation, Postponement & Front-Office Check-In — Design / Plan

**Date:** 2026-06-12
**Status:** Plan only — DO NOT implement until explicitly asked.
**Scope:** Regular bookings. Three related workstreams + a shared approval spine.

## Confirmed decisions
1. **Approver = a new `Sales Admin` role** (12th role).
2. **Refunds reuse the `payments` ledger** with `type = 'refund'` (single money trail).
3. **Front Office:** Front Office collects money **only at checkout**, so on the FO screen **both Pay and Bill are gated to departure day**. Advances/balances during the stay are taken by the **Sales team** through the bookings flow (unchanged, ungated). "In-house" becomes **explicit check-in status**, not date math.

## Current-state findings (what doesn't work today)
- **No `Sales Admin` role.** Roles: Sales, Front Office, Accounts, Admin + 7 operational. Sales can cancel directly with no approval.
- **No request→approve→act primitive** anywhere in the app.
- **`cancelBooking`** is a one-step soft-void (Sales/Admin): `status→cancelled`, frees rooms, journals `booking_history`. No reason, no refund, no states.
- **Postponement** doesn't exist; date edits go straight through `updateBooking`.
- **No real check-in.** `checked_in`/`checked_out` exist in `BookingStatus` and the DB constraint (migration 006) but are **never set for regular bookings**. Front-office "In-House" = `arrival ≤ today < departure` (pure dates). Pay & Bill are always shown on every sub-tab.
- DB constraints verified: `bookings_status_check` already allows checked_in/checked_out (no migration). `payments.type` allows only advance/balance/btc_receipt (needs widening). `profiles.role` CHECK lists the 11 roles (needs widening).

---

## Workstream A — `Sales Admin` role + request/approval spine (FOUNDATION, build first)

### A1. New role
- **Migration:** `ALTER TABLE profiles DROP CONSTRAINT ...role check; ADD ...` to include `'Sales Admin'`.
- **Code wiring:** add `'Sales Admin'` to `ALL_ROLES` (`src/lib/types/profile.ts` — note: `ALL_ROLES` actually lives in `src/lib/constants/roles.ts`; `profile.ts` re-exports/uses it), `ROLE_COLORS`, `ROLE_SUBTITLE`, `DEFAULT_TAB_BY_ROLE`, and the invite/role dropdown under `(admin)/admin/users/new`.
- **Permissions (`src/hooks/usePermissions.ts`):** Sales Admin inherits all Sales capabilities **plus** `canApproveRequests`. Mirror every Sales-gated server action (`['Sales','Admin']` → `['Sales','Sales Admin','Admin']`) so a Sales Admin can do everything a Sales agent can. Audit each occurrence.

### A2. `booking_requests` table (new)
```
id text PK
booking_id text -> bookings(id)
type text CHECK (type IN ('cancellation','postponement'))
status text CHECK (status IN ('pending','approved','rejected','completed')) DEFAULT 'pending'
reason text                       -- cancellation reason / postponement comment
payload jsonb                     -- postponement: { arrival, departure, nights }
requested_by text, requested_at timestamptz
decided_by text, decided_at timestamptz    -- the Sales Admin
completed_by text, completed_at timestamptz
```
RLS: `FOR ALL TO authenticated` (authorization re-checked in actions, matching repo convention).

### A3. Actions (`src/lib/actions/requests.ts`, new) + queries
- `requestCancellation(bookingId, reason)` — Sales/Sales Admin/Admin; only for active regular bookings; one open request at a time.
- `requestPostponement(bookingId, { arrival, departure }, comment)` — runs `checkRoomConflict` on the new dates **up front**; rejects impossible moves before queuing.
- `decideRequest(requestId, 'approved'|'rejected')` — **Sales Admin/Admin only**. On approve, performs the side-effect per type (below). Journals to `booking_history`.
- All return `ActionResult`, `revalidatePath` the affected routes.

### A4. Approval queue UI
- A surface for Sales Admin showing pending requests (cancellation + postponement) with approve/reject. Start as a **section on the dashboard** + a filter on Bookings; promote to its own nav tab only if volume warrants.

---

## Workstream B — Cancellation flow
1. **Request** (Sales): reason dropdown (Guest request · Date change · Payment not received · Duplicate · Overbooking · Other+free-text) → creates `pending` cancellation request. Booking stays active. **Replaces** the current instant Sales cancel; Admin keeps a direct hard-cancel escape hatch.
2. **Approve/Reject** (Sales Admin): on approve → booking `status→cancelled`, rooms freed, `cancellation_reason/cancelled_by/cancelled_at` stamped, history journaled. On reject → booking untouched, request closed.
3. **Initiate refund** (Sales agent, only after approval): enter amount/mode/reference → creates a `payments` row `type='refund', refund_status='pending'` (negative or flagged so it nets out).
4. **Accounts "Refund" tab**: lists approved cancellations with a `pending` refund **only** (gated on approval). Accounts flips **`refund_status='done'`** ("Refund Done") when paid.

**Migration (B):** widen `payments.type` CHECK to add `'refund'`; add `refund_status text CHECK (refund_status IN ('pending','done'))` (nullable). Add `cancellation_reason/cancelled_by/cancelled_at` to `bookings`.

**Ledger note:** `getBookingPaymentStatus` and any totals must treat refunds as outflow so paid/balance stay correct.

---

## Workstream C — Postponement flow
1. **Request** (Sales): new arrival/departure + reason; conflict pre-checked → `pending`.
2. **Approve** (Sales Admin).
3. **Apply / "Initiate postponement"** (Sales agent, after approval): re-runs `checkRoomConflict` at apply time, updates dates via the existing booking-update path, journals old→new, request → `completed`.

No new table beyond `booking_requests`. New dates live in `payload`.

---

## Workstream D — Front Office check-in + gated Final Bill
1. **Check-in action** (`checkIn`, FO/Admin): `confirmed → checked_in`, only when `arrival ≤ today` and not cancelled. Button on **Today's Arrivals**.
2. **Check-out action** (`checkOut`): `checked_in → checked_out`.
3. **Lists become status-driven** in `FrontOfficeClient.tsx`:
   - Arrivals = `confirmed`, `arrival === today` (not yet checked in).
   - In-House = `status === 'checked_in'`.
   - Departures = `checked_in`, `departure === today`.
4. **Gating:** Front Office collects only at checkout, so **both `+ PAY` and `BILL` are shown only when `departure === today`** (the Departures list). They do **not** appear on Arrivals or In-House. Advances/balances earlier in the stay are handled by Sales via the bookings PaymentModal (separate screen, ungated). Per decision 3.
5. **Day-one backfill:** existing in-stay confirmed bookings have no `checked_in` status. Decide: auto-treat current-stay confirmed bookings as checked-in via a one-off update, **or** require FO to check them in manually. (Recommend a one-off backfill so the screen isn't empty on launch.)

**No DB migration for D** — statuses already allowed by constraint 006.

---

## Migrations summary
1. `profiles.role` CHECK → add `'Sales Admin'`.
2. `payments.type` CHECK → add `'refund'`; add `payments.refund_status`.
3. New `booking_requests` table (+ RLS).
4. `bookings` → `cancellation_reason`, `cancelled_by`, `cancelled_at`.
(Per repo convention, migrations are hand-applied in the Supabase SQL editor and numbered `008_…`, `009_…`.)

## Build order
A (role + spine) → D (check-in, self-contained, high value) → B (cancellation + refunds) → C (postponement).
Gate every step on `npm run build` (strict TS — the only CI gate) + manual click-through.

## Tensions / risks to watch
- **`Sales Admin` is cross-cutting:** every `['Sales','Admin']` role check in actions, RLS, and nav must consciously decide whether Sales Admin is included. Easy to miss one and silently lock them out.
- **Refund-as-payment sign:** refunds must reduce "paid"/"balance" everywhere they're summed (`getBookingPaymentStatus`, accounts, reports, dashboard) — a missed spot inflates revenue.
- **Approval ↔ booking timing:** booking is cancelled at **approval**, before the refund completes; a pending refund can outlive the cancelled booking. Acceptable, but the UI must make a cancelled-but-refund-pending booking obvious.
- **Postponement re-conflict:** rooms can get taken between request and apply — the apply-time re-check is mandatory, not optional.
- **Who can request vs approve:** a Sales Admin can both request and approve. Decide whether self-approval is allowed or must be a different person.

## Open decisions (non-blocking; defaulting to recommendation)
- Self-approval by a Sales Admin: allow vs forbid (recommend allow for now; revisit).
- Approval surface: dashboard section first vs dedicated nav tab (recommend dashboard section).
- Day-one check-in backfill: auto vs manual (recommend auto one-off).
