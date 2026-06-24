# Spec — Hold → Advance → Voucher → Confirmed lifecycle

_Date: 2026-06-23 · Approved._

## Goal
Make the voucher the confirmation event, protect paid holds, and nudge Sales with in-app reminders.

New lifecycle:
```
Rooms Blocked (hold)
  → [advance payment]  → "Advance Payment Received"   (hold extended to now+2 days; paid amount shown)
  → [Sales: Send Voucher] → "Booking Confirmed"        (voucher sent + booking confirmed in one action)
```

## Decisions (locked)
- **Send Voucher = confirm.** Clicking "Send Voucher" dispatches the voucher AND confirms the booking. Replaces the old "Book →" click.
- **Reminders = in-app alert panel** (Sales + Admin) on Dashboard + Enquiries.
- **Unpaid-hold expiry warning = 24h** before expiry.
- **Advance Received = any advance payment** (no amount gate in this pass; friction-F2 can layer later).

## Data (migration 014)
```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS voucher_sent boolean NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS voucher_sent_at timestamptz;
```
Type: `Booking.voucherSent: boolean`, `voucherSentAt: string | null`. Reuse `hold_expires_at` for extension.

## Components

### A. Status relabels (constants/enquiry.ts)
`advance_confirmed` label → **"Advance Payment Received"**; `booked` label → **"Booking Confirmed"**. Values unchanged.

### B. Advance payment → extend hold +2 days (payment-sync.ts)
`syncEnquiryStageFromPayment`: when a held booking gets its first payment (stage becomes `advance_confirmed`), set `hold_expires_at = max(existing, now + 2 days)`. Idempotent; applies to staff-recorded + webhook payments.

### C. Send Voucher confirms (new action `sendVoucherAndConfirm`)
In `actions/dispatch.ts` (or enquiries): require an advance-paid hold; dispatch the voucher; set `voucher_sent=true, voucher_sent_at=now`; flip booking `hold → confirmed`, `hold_expires_at=null`; set enquiry → `booked`. Replaces `bookEnquiry`'s role (which currently auto-dispatches on book). Re-sending a voucher on an already-confirmed booking just re-dispatches (no status regression).

### D. "Voucher Sent" column + Send Voucher button (EnquiriesClient)
- Pipeline row at "Advance Payment Received": primary action **Send Voucher** (calls `sendVoucherAndConfirm`); the old "Book →" is removed.
- A **Voucher Sent** column shows **No** until sent, then **Yes**.

### E. Paid holds protected (friction F1, essential here)
`releaseExpiredEnquiryHolds` + `releaseEnquiryHold`: **skip/refuse any hold with a non-refund payment.** A paid hold never auto-cancels even past the +2 days; it surfaces in "Vouchers not sent" instead. Unpaid holds expire as today.

### F. Reminders panel (in-app, Sales + Admin)
Two derived lists on Dashboard + Enquiries:
- **Vouchers not sent** — bookings that are advance-paid holds with `voucher_sent=false` → one-click **Send Voucher**.
- **Holds expiring soon** — unpaid holds with `hold_expires_at` within 24h → **Extend Hold** (+24h/+48h/+72h) with time-left shown.
Prominent amber/red panels, visible until resolved.

## Testing
- Unit: hold-extend (max logic), reminder selection (paid-voucher-pending; unpaid-<24h), voucher-confirm transition, paid-hold-skip-on-expiry.
- Live prod E2E: pay advance → "Advance Payment Received" + hold +2d + in "Vouchers not sent" → Send Voucher → "Booking Confirmed" + voucher_sent; unpaid hold <24h → in "Holds expiring" + Extend; paid hold past expiry → not cancelled.
- Gate: `npm run build` + lint + tests per phase. Migration 014 applied by hand before deploy.
