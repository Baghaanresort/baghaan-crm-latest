# Enquiry Pipeline (Spec 4.2) — Design

**Date:** 2026-06-11
**Status:** Approved (design); pending implementation plan
**Scope:** Enquiries module — full lead lifecycle from capture through BLOCK → PAY → VERIFY → BOOK.

---

## 1. Summary

Today the Enquiries module supports four statuses (`new | in_progress | booked | lost`)
and a single "Convert →" action that redirects to the Bookings form with prefilled
fields. Room holds, advance payments, and verification all live in the **Bookings**
module and are not connected to a lead.

Spec 4.2 requires the enquiry record to drive the entire pre-booking pipeline from
*within the Enquiry tab*: block rooms, take an advance, have Accounts verify it, and
only then convert to a confirmed booking — with the lead never leaving the Enquiry tab
until BOOK.

This is delivered in **two sub-projects**:

- **SP1 — Enquiry pipeline state machine** (this spec; build now).
- **SP2 — Voucher auto-dispatch** (email via Resend; WhatsApp deferred). Plugs into a
  `dispatchVoucher()` seam created in SP1. Tracked separately — it has external
  dependencies (provider accounts, Meta-approved WhatsApp templates).

---

## 2. Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Implementation model | **Reuse hold-booking + payments machinery** | One source of truth for room occupancy; reuses conflict-check, calendar, payments queue, voucher gen |
| Voucher dispatch (SP2) | **Real auto-integration**, email = **Resend**, WhatsApp = **deferred** (no account yet) | Email buildable on API key; WhatsApp needs provider + template approval |
| Hold expiry | **Lazy on-load** release | No infra; matches how `holdExpiresAt` is already used |
| Standalone "Block Rooms" in Bookings | **Keep both** entry points | Walk-ins / phone-only still need a direct path |
| SP1 voucher dispatch | **Logged, not actually sent** | Decouples SP1 from SP2's external setup |

---

## 3. Approaches considered

- **A. Reuse hold-bookings + payments (CHOSEN).** BLOCK creates a `hold` booking linked
  to the enquiry; PAY is a payment on it; VERIFY is the existing Accounts flow; BOOK flips
  `hold → confirmed`. The hold→confirmed transition *is* the moment the record enters the
  Bookings tab, satisfying "no booking record until BOOK" for free.
- **B. Enquiry-native holds + enquiry-scoped payments.** New `enquiry_holds` table;
  payments gain a nullable `enquiry_id`; calendar and conflict-checker read both tables.
  Rejected: two sources of truth for room occupancy → double-booking risk; duplicates
  conflict/calendar logic; payments FK rework.
- **C. Status-only (text fields, no real reservation).** Rejected: rooms aren't actually
  held, so the calendar wouldn't reflect them and double-booking is possible — fails the
  core purpose.

---

## 4. State machine

| Enquiry status | Underlying reality | Trigger |
|---|---|---|
| `new` / `in_progress` | enquiry row only | create / edit |
| `rooms_blocked` | + linked `hold` booking (`holdExpiresAt`, `source_enquiry_id`) | **BLOCK ROOMS** |
| `advance_pending` | + unverified `advance` payment on that booking | **PAY** |
| `advance_confirmed` | the payment `verified = true` | Accounts **VERIFY** |
| `booked` | hold booking → `confirmed`, voucher generated, `dispatchVoucher()` fired, `linked_booking_id` set | **BOOK** |
| `lost` | enquiry; any linked hold released | Mark Lost |

**Status keys** (DB/code values): `new`, `in_progress`, `rooms_blocked`,
`advance_pending`, `advance_confirmed`, `booked`, `lost`.
**Labels** (UI): New, In Progress, Rooms Blocked, Advance Pending Verification,
Advance Payment Confirmed, Booked, Lost.

### Transition rules
- BLOCK ROOMS: allowed from `new` / `in_progress`. Runs `checkRoomConflict`; on success
  creates the hold booking, stamps `enquiries.held_booking_id`, status → `rooms_blocked`.
- PAY: allowed from `rooms_blocked` (and re-enabled if a prior payment was rejected).
  Records an `advance` payment (`verified = false`) on the held booking; status →
  `advance_pending`. The PAY button is disabled while an unverified/verified payment exists.
- VERIFY: performed by Accounts in the existing payments queue. When a verified payment's
  booking has a `source_enquiry_id`, the enquiry auto-advances to `advance_confirmed`.
  If Accounts rejects/deletes the payment, the enquiry reverts to `rooms_blocked`.
- BOOK: allowed from `advance_confirmed`. Flips the held booking `hold → confirmed`,
  generates/returns the voucher, sets `linked_booking_id` = held booking, status →
  `booked`, fires `dispatchVoucher()`. No new booking row is created — the held one is reused.
- MARK LOST: allowed from any non-`booked` status. If a hold exists, it is released
  (booking → `cancelled`, rooms freed) before the enquiry is marked `lost`.

---

## 5. Data & visibility

- **`enquiries.held_booking_id text`** (new) — the in-flight hold. Distinct from
  `linked_booking_id`, which stays reserved for the *final* Booked link so the existing
  "↗ Converted" badge keeps its meaning.
- **Hold booking carries `source_enquiry_id`** (column already exists) — the back-link.
- **Bookings-tab list** hides `status = 'hold' AND source_enquiry_id IS NOT NULL`
  (enquiry-driven holds belong in the Enquiry tab). Standalone holds (no enquiry) still show.
- **Calendar** shows all holds (amber striping) regardless of origin — unchanged.
- **Display of blocked rooms / advance amount / payment reference** on the enquiry is
  derived by joining the linked hold booking + its latest payment in the enquiries query —
  not duplicated onto the enquiry row.

### Lazy hold expiry
A `releaseExpiredHolds()` helper runs at the top of the enquiries / calendar / dashboard
data loads. For every enquiry-linked hold where `holdExpiresAt < now` and the booking is
still `hold`: set booking → `cancelled`, clear `enquiries.held_booking_id`, revert enquiry
to `in_progress`, and log an enquiry activity. Sales can also release a hold manually.

---

## 6. Components & changes (SP1)

### Migration `007_enquiry_pipeline.sql`
- Drop & re-add `enquiries_status_check` with the 7 values.
- `ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS held_booking_id text`.
- (Optional index) `idx_bookings_source_enquiry_hold` partial on
  `(source_enquiry_id) WHERE status = 'hold'`.

### Types & constants
- `src/lib/types/enquiry.ts`: expand `EnquiryStatus` to the 7 keys; add `heldBookingId`.
- `src/lib/mappers/enquiry.ts`: map `held_booking_id ↔ heldBookingId`.
- `src/lib/constants/enquiry.ts`: add the new status entries (label + dot/colour);
  expand `ENQUIRY_SOURCES` (WhatsApp / Instagram / Phone / Website / Referral / Walk-in /
  Email / Other) and enquiry-type options (Weekend / Weekday / Wedding / Corporate Offsite /
  Group Booking / Day Visit / Mango Season / Other).
- `src/lib/validations/enquiry.ts`: accept the new statuses.

### Server actions (`src/lib/actions/enquiries.ts`)
- `blockEnquiryRooms(enquiryId, input)` — validates, conflict-checks, creates the hold
  booking via a refactored `createBlockedRoom({ ..., sourceEnquiryId })`, stamps
  `held_booking_id`, status → `rooms_blocked`, logs activity.
- `recordEnquiryAdvance(enquiryId, input)` — creates the `advance` payment on the held
  booking (reusing the payments action), status → `advance_pending`, logs activity.
- `bookEnquiry(enquiryId)` — guards `advance_confirmed`; flips held booking → `confirmed`;
  sets `linked_booking_id`; status → `booked`; calls `dispatchVoucher(bookingId)`;
  revalidates enquiries + bookings + calendar + vouchers; logs `booking_created`.
- `releaseEnquiryHold(enquiryId)` — manual release (also used by the lazy expiry helper).

### Payments verify hook (`src/lib/actions/payments.ts`)
- After a payment is verified/unverified/deleted, if its booking has a `source_enquiry_id`,
  sync the enquiry status (`advance_confirmed` on verify; back to `rooms_blocked` on
  reject/delete).

### Bookings refactor (`src/lib/actions/bookings.ts`)
- `createBlockedRoom` accepts an optional `sourceEnquiryId` and writes it onto the booking.
- `getBookings` / bookings query filters out enquiry-linked holds (see §5).

### Dispatch seam (`src/lib/actions/vouchers.ts` or new `dispatch.ts`)
- `dispatchVoucher(bookingId)` — SP1 implementation records dispatch intent + timestamps
  for email + WhatsApp channels (surfaced in the Vouchers tab). SP2 replaces the body with
  real sends; the signature stays stable.

### UI (`src/app/(app)/enquiries/`)
- New **`BlockRoomsModal`** in the Enquiry tab: dates, room picker (reuse the bookings
  room-selector), hold expiry (24h / 48h / 72h / 7-day), quoted amount.
- `EnquiriesClient` action column: status-driven buttons —
  `new/in_progress` → **BLOCK ROOMS**; `rooms_blocked` → **PAY** (+ release);
  `advance_pending` → *awaiting Accounts* (disabled); `advance_confirmed` → **BOOK**;
  `booked` → view voucher. Mark Lost stays available pre-`booked`.
- Status pills / filters / KPIs extended to the 7 statuses.
- Enquiry view modal surfaces blocked rooms, advance, payment ref, hold expiry countdown.

---

## 7. Out of scope (→ SP2)

Real email (Resend) and WhatsApp delivery of the voucher. SP1 only logs dispatch.
WhatsApp is additionally blocked on choosing a BSP/Meta provider and getting message
templates approved.

---

## 8. Testing notes

No automated test suite exists; `npm run build` is the typecheck/CI gate. Manual
verification path: create enquiry → BLOCK (verify calendar amber + hidden from Bookings)
→ PAY (verify Accounts queue) → VERIFY (verify enquiry auto-advances) → BOOK (verify
hold→confirmed, appears in Bookings, voucher generated, dispatch logged) → and an
expiry path (block with 24h, force-expire, confirm lazy release reverts to In Progress).
