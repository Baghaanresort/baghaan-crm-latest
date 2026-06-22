# Trello Changes — Recent Work

**Commit:** `feat: FO check-in form, corporate cost-sheet/PI preview, accounts revamp (no verification), itemised reservation financials`

This document lists every recent change (requested via screenshots / Trello) **and the approach used** to implement each one.

---

## 1. Front Office — Check-in & Checkout

**Changes**
- Check-in is now a form: **Number of Guests** (Adults, Child Below 6, Child 6–12, Child 12–18), **Rooms Assigned**, **Room Numbers**.
- On check-in the guest becomes **InHouse** (shows in the In-House Guests list).
- **Check Out** asks a confirmation popup before completing.
- New **Checked Out** sub-tab listing all checked-out guests.

**Approach**
- Added a `check_in_details` JSONB column on `bookings` (migration `009`) instead of many new columns — keeps the schema flexible and mirrors the existing `final_bill` pattern.
- New `CheckInModal` component collects + Zod-validates the data; `checkInBooking` server action persists it and sets status to `checked_in` (journaled to `booking_history`).
- "InHouse" is a **display concept** — the internal status stays `checked_in`, so no risky DB enum change; the guest simply appears in the In-House Guests list.
- Checkout uses a styled confirm dialog before calling `checkOutBooking`; a status-driven "Checked Out" tab filters `status === 'checked_out'`.

## 2. Corporate

**Changes**
- "New Corporate Booking" → **"New Company Details"**; Rooms picker removed.
- Cost sheet: **Qty → No. of Pax**, **Units → No. of Rooms**; totals = **Rate × No. of Pax** (rooms no longer multiplies).
- **Generate PI** shows a **preview first**, with a GENERATE PI confirm button.

**Approach**
- Relabelled the modal and removed the room-grid section (room detail lives in the cost sheet); existing rooms on a record are preserved on edit, not wiped.
- Changed the total formula in one place per surface: the cost-sheet editor, the on-screen PI preview, and **all** PDF/print templates were updated together so figures stay consistent end-to-end. Stored grand totals were unaffected.
- PI preview reuses the existing `ProformaInvoicePreview` in a new **draft mode**: a PI is built client-side from the cost sheet for review, and only persisted when the user clicks GENERATE PI.

## 3. Accounts

**Changes**
- **Accounts role can now see / land on the Dashboard.**
- **Transaction verification removed** — every payment counts immediately.
- New sections: **Advance Payments**, **Payments at the Resort**, **Total Billed**.

**Approach**
- Removed Accounts from the default-tab redirect map so the Dashboard (which already carries Accounts KPIs) is reachable.
- Verification removed at the source: the payment-status helper now counts **all** non-refund payments toward the balance (no `verified` filter), and new payments are marked counted on creation. The Pending Verification tab, modal banners, and dashboard/bookings/admin verification UI were then cleaned up.
- The three new sections are read-only sub-tabs derived from existing data (advance-type payments, Front-Office-recorded payments, and bookings with a final bill) — no schema change.

## 4. Reservation / Hold — Itemised Financials

**Changes**
- New **Room Charges** table: *Room Type · Room Price · No. of Rooms · Total*.
- New **Add Ons** table: *Name · Price Per Unit · Number of Units · Total Amount*.
- **Total Package Amount = Room Charges + Add Ons** (auto, still hand-overridable).

**Approach**
- Added `room_charges` and `add_ons` JSONB columns (migration `010`), threaded through types, validation, mappers, and the create/update actions.
- The room table is **auto-seeded** from the selected rooms grouped by category (default rate × nights) and stays editable; add-ons compute Total = price × units.
- The grand total auto-sums rooms + add-ons but keeps the existing manual-override toggle; the saved rate-breakdown text is generated from the rows so vouchers/PDFs keep working. Applies to both new reservations and holds (same modal).

## 5. Reservations list

**Change**
- For the **Sales team**, **+PAY** disappears once the advance is recorded, and **BILL** is never shown to Sales.

**Approach**
- This was already the behaviour (Sales sees +PAY only while nothing is paid; BILL is Front-Office/Admin only). The screenshot showed the Admin view. Only a leftover condition from the verification removal was tidied.

---

## Database migrations (applied by hand in Supabase)
- `009_checkin_details.sql` — `bookings.check_in_details`. **Run.**
- `010_room_charges_addons.sql` — `bookings.room_charges` + `bookings.add_ons`. **Run.**

## Verification
- `npm run build` (the project's typecheck/CI gate) passes clean after every change.
