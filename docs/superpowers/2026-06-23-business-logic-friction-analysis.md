# Baghaan CRM — Business-Logic Friction & Ambiguity Analysis

_Date: 2026-06-23 · Scope: enquiry → hold → advance → booking → check-in → checkout, plus payments/holds/notifications._

## The intended happy path

```
Enquiry (new / in_progress)
  → Block Rooms ............... booking.status = hold,  enquiry.status = rooms_blocked
  → Record advance ........... (engine) enquiry.status = advance_confirmed   [automatic]
  → "Book →" (human) ......... booking.status = confirmed, enquiry.status = booked
  → Check In (FO form) ....... booking.status = checked_in  ("In-House")
  → Settle + Check Out ....... final bill recorded, balance = ₹0, status = checked_out
```

Parallel tracks: standalone **Block Rooms** holds (no enquiry), the **corporate** pipeline (cost sheet → PI → advance → confirmed), **BTC** receivables, and **refunds**.

---

## Findings (ranked)

| # | Severity | Issue | Core friction |
|---|----------|-------|---------------|
| F1 | **HIGH** | Paid holds can be silently cancelled on expiry | A guest pays the advance; if staff don't click "Book" before the hold expiry passes, the hold auto-cancels and the payment is orphaned |
| F2 | **HIGH** | Advance amount is not enforced | Any payment (even ₹1) flips the enquiry to `advance_confirmed` and unlocks "Book". The "Advance to be Paid" target is ignored as a gate |
| F3 | **MED** | "Send Advance Request" ignores "Advance to be Paid" | It charges 50% of the total (global default), not the per-hold target the user sets |
| F4 | **MED** | Standalone holds never expire | Dashboard "Block Rooms" holds (no enquiry) are skipped by the expiry sweep — they keep rooms blocked forever |
| F5 | **MED** | Dual status: raw `hold` vs effective `confirmed` | A hold with any payment shows "Confirmed" in the Bookings list but isn't actually booked until "Book" — two sources of truth |
| F6 | **MED** | Two enquiry→booking paths with different gates | `bookEnquiry` (advance-gated) vs creating a booking in the modal + `markEnquiryConverted` (no advance gate) |
| F7 | **LOW** | Stale "verification" wording | `bookEnquiry` error says "A **verified** advance payment is required"; the `advance_pending` ("Advance Pending Verification") stage is retired but still exists |
| F8 | **LOW** | Payment type is auto-guessed by date | A balance taken before arrival is logged as `advance`; affects the Accounts "Advance Payments" vs "balance" split accuracy |

---

## Detail & fix direction

### F1 — Paid holds can be cancelled on expiry (HIGH)
`releaseExpiredEnquiryHolds` (run on every Enquiries page load) cancels **any** booking with `status='hold'` whose `hold_expires_at` has passed — regardless of whether an advance was already recorded. Because a hold stays raw `status='hold'` until the human "Book" step, an enquiry sitting at `advance_confirmed` **with money paid** is eligible for auto-cancel. `releaseEnquiryHold` (manual) has the same blind spot.
**Impact:** orphaned payments, lost confirmed-advance state, a guest who paid losing their rooms.
**Fix direction:** never expire/release a hold that has a recorded (non-refund) payment, or that is at `advance_confirmed`. Optionally extend expiry automatically once an advance lands.

### F2 — Advance amount not enforced (HIGH/MED)
After verification removal, `syncEnquiryStageFromPayment` advances the enquiry to `advance_confirmed` on **any** payment. `bookEnquiry` then only checks `status === 'advance_confirmed'` and `total > 0`. Neither the per-hold **Advance to be Paid** nor the global advance % is used as a threshold.
**Ambiguity:** if a ₹1 token payment unlocks booking, what does "Advance to be Paid = ₹8,000" mean?
**Fix direction (decision needed):** (a) hard gate — only reach `advance_confirmed` / allow "Book" when `paid ≥ advance target`; or (b) keep it advisory but surface a clear "short by ₹X" warning on the Book action; or (c) a partial state (`advance_partial`) distinct from `advance_confirmed`.

### F3 — Send Advance Request ignores the target
`requestAdvance` uses `computeAdvance(total, advancePct)` (50% default), not `booking.advanceRequired`.
**Fix:** when `advanceRequired > 0`, request that amount; else fall back to the % default.

### F4 — Standalone holds never expire
The expiry sweep filters `source_enquiry_id is not null`, so dashboard "Block Rooms" holds are never released and silently keep rooms unavailable.
**Fix direction:** include standalone holds in the sweep (cancel on expiry), or surface them in a "holds about to expire" list for manual action.

### F5 — Dual status (raw vs effective)
`getEffectiveStatus` returns `confirmed` once any payment exists, so a paid-but-not-booked hold reads "Confirmed" in the Bookings list while the enquiry still shows "Advance Payment Confirmed" needing "Book".
**Fix direction:** distinguish the labels (e.g., "Advance Paid · awaiting Book" vs "Confirmed"), and/or make "Book" the single confirmation event reflected consistently.

### F6 — Two confirm paths
`bookEnquiry` confirms the **held** record and requires `advance_confirmed`. Creating a *new* booking in `BookingModal` with a `sourceEnquiryId` calls `markEnquiryConverted` → enquiry `booked` with **no** advance check (and leaves the held booking separate).
**Fix direction:** route enquiry confirmation through one gated path, or make `markEnquiryConverted` reconcile/cancel the existing hold and apply the same gate.

### F7 — Stale wording
Update the `bookEnquiry` error to drop "verified"; relabel/retire the `advance_pending` enquiry stage consistently.

### F8 — Payment type guessing
`PaymentModal` sets `type` by date (`departure<today→btc_receipt`, `arrival<=today→balance`, else `advance`). It's user-overridable (a dropdown), but the default can mislabel and skew Accounts' Advance vs Balance split.
**Fix direction:** keep the dropdown but improve the default (e.g., a pre-arrival hold payment = `advance`; a payment against a final bill = `balance`).

---

## Recommended first cut

The two **HIGH** items (F1 paid-hold safety, F2 advance enforcement) plus their natural companions (F3 advance amount, F4 standalone expiry) form a coherent "**hold & advance integrity**" workstream — they're the ones that can lose money or rooms. F5–F8 are clarity/cleanup and can follow.
