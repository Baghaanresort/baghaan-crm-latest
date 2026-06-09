# Changelog

CRM enhancement tasks. One entry per task.

## Task 1 — "New Enquiry" on Dashboard

Added a **NEW ENQUIRY** action button to the dashboard, alongside the existing
NEW BOOKING / BLOCK ROOMS buttons, opening the existing `EnquiryModal`.

- `src/app/(app)/dashboard/DashboardClient.tsx`
  - Dynamically import `EnquiryModal` (same lazy pattern as the other modals).
  - New `showNewEnquiry` state.
  - NEW ENQUIRY button in the Sales/Admin action group (outline-emerald style to
    distinguish it from the solid NEW BOOKING primary).
  - Render `<EnquiryModal>` on demand; it handles validation, toast, `router.refresh()`
    and close internally.

**Permissions:** button sits inside the existing `(isSales || isAdmin)` block, matching
the `['Sales','Admin']` server-side allowlist in `createEnquiry`. No new server code.

**Test:** `npx tsc --noEmit` clean. Manual: as Sales/Admin, Dashboard → NEW ENQUIRY →
fill name/phone/source → Save → toast "Lead #N created", modal closes. Open Enquiries tab →
new lead present. As a non-Sales/Admin role, the button is absent (and `createEnquiry`
rejects server-side).

## Task 2 — Convert enquiry → booking with prefilled data

The convert flow already existed (enquiry → `/bookings?convert=…` → `BookingModal` prefill →
on save `markEnquiryConverted` links the enquiry: status `booked` + `linked_booking_id`).
It prefilled name/phone/email but **dropped the notes**. Per decision, we prefill all
cleanly-mapping fields (name, phone, email, **notes**) and leave the free-text
*Preferred Dates* / *Number of Rooms* for the user to fill (they don't map to the booking's
date pickers / room selector). All booking fields remain editable.

- `src/app/(app)/enquiries/EnquiriesClient.tsx` — add `remarks` (the
  `convertEnquiryToBooking` notes string, e.g. "From enquiry #N: …") to the convert URL.
- `src/app/(app)/bookings/BookingsClient.tsx` — read the `remarks` param and carry it into
  `convertPrefill`; it already flows into `BookingModal`'s `prefill` (which maps
  `prefill?.remarks` → the remarks field).

**Test:** `npx tsc --noEmit` clean. Manual: Enquiries → a lead with notes → **Convert →** →
booking modal opens with name/phone/email/notes prefilled, dates/rooms blank for the user →
fill + Save → booking created; back on Enquiries the lead shows "↗ Converted" (status booked,
linked to the new booking).

## Task 3 — Record "Lost" reasons (free-text "Other")

The Lost flow already had a `LOST_REASONS` dropdown + `lost_reason`/`lost_at` columns
(migration 001). Gaps closed: "Other" now reveals a **free-text box** (it stored the literal
"Other" before), reason is now **required**, and the modal's Stage=Lost path (which bypassed
the prompt) now captures a reason too. **No DB migration** — columns already exist;
`updateEnquiry` already persists `lostReason` and auto-stamps `lost_at`.

- `src/app/(app)/enquiries/EnquiriesClient.tsx` — "Mark as Lost" dialog: added `otherText`
  to dialog state; conditional free-text input when reason = Other; `handleMarkLost` resolves
  Other→text and validates a reason is present.
- `src/components/enquiries/EnquiryModal.tsx` — when Stage = Lost, show a Loss Reason select
  + conditional Other input. Form state seeds from an existing reason (known value →
  dropdown; custom value → Other + text). `handleSave` resolves + validates. Extra `lostOther`
  key is stripped by the (non-strict) Zod schema. Note: `createEnquiry`'s schema has no
  `lostReason`, so creating an enquiry already-Lost won't store the reason — rare edge case,
  the normal path is editing an existing lead to Lost.

**Test:** `npx tsc --noEmit` clean. Manual: (a) list **Lost** button → pick "Other" → text box
appears, required → Confirm stores the typed text (visible as the lead's lost reason / in
activity log). (b) Edit a lead → Stage = Lost → Loss Reason field appears, same Other behavior;
saving without a reason is blocked.

## Task 4 — Remove enquiry delete (UI + server + RLS)

Enquiries are now non-deletable. Removed at all three layers.

- `src/app/(app)/enquiries/EnquiriesClient.tsx` — removed the trash button, `handleDelete`,
  and the now-unused `Trash2` icon + `deleteEnquiry` imports.
- `src/lib/actions/enquiries.ts` — removed the `deleteEnquiry` server action (replaced with a
  comment explaining why). Nothing else referenced it.
- `supabase/migrations/002_lock_enquiry_delete.sql` — **NEEDS TO BE RUN MANUALLY** in the
  Supabase SQL editor. Adds a RESTRICTIVE `FOR DELETE USING (false)` policy on `enquiries`,
  which AND-combines with existing permissive policies to block all deletes via RLS without
  affecting select/insert/update. (Service-role bypasses RLS but the app never deletes
  enquiries with it.)

**Test:** `npx tsc --noEmit` clean. Manual: Enquiries list + Edit modal no longer show any
delete control. After running migration 002, a DELETE on `enquiries` from an authenticated
client affects 0 rows. ⚠ Migration 002 is **not yet applied** — run it to complete the task.

## Task 5 — Auto-refresh entries on tab activation

Lists could show stale data (e.g. another user's new booking) until a hard reload, because
App Router serves already-visited routes from the client cache. Two-part fix:

- `src/components/layout/NavTabs.tsx` — `NavTabs` lives in the persistent `(app)` layout, so
  it doesn't remount on navigation. Added a `useEffect` that calls **`router.refresh()`**
  whenever `pathname` changes (i.e. a tab is activated), re-running the destination's Server
  Component. First render is skipped (initial load is already fresh from SSR). Confirmed
  against Next 16 bundled docs: `router.refresh()` refetches the *current* route and clears
  its client cache, and the effect runs after the pathname is already the destination.
- `src/app/(app)/bookings/BookingsClient.tsx` — **root-cause fix.** It alone seeded
  `const [bookings] = useState(initialBookings)` with no setter/re-sync, so it stayed frozen
  at first mount — `router.refresh()` (and even post-mutation refreshes) never updated the
  list; only a full reload did. Switched to reading `initialBookings`/`initialPayments`
  straight from props (matching Dashboard/Accounts/Calendar/etc., which were already fresh).
  EnquiriesClient already re-synced via effect; VouchersClient reads props directly.

**Test:** `npx tsc --noEmit` clean. Manual: in window A create a booking/enquiry; in window B
(already on another tab) click into Bookings/Enquiries → the new row appears without a reload.
Switching tabs and back re-pulls current data each time.

## Task 6 — Editable Blocked Room (hold) + Convert to Booking

Holds are `bookings` rows with `status='hold'`. `BlockModal` was create-only; made it
edit-capable and routed hold edits to it (instead of the generic booking modal).

- `src/components/bookings/BlockModal.tsx` — new optional `booking` (edit) + `onConvert`
  props. In edit mode it seeds the form from the hold, excludes the hold's **own** rooms from
  the occupied-greyout, titles "Edit Hold", and the save button reads **"UPDATE HOLD"**
  (calls `updateBooking`). Added a **"CONVERT TO BOOKING"** button (edit mode only) that calls
  `onConvert(hold)`. Update spreads the *full* hold then overrides only block-editable fields,
  because `bookingToDb` fills `||` defaults — a sparse partial would clobber unrelated columns.
- `src/components/bookings/BookingModal.tsx` — new optional `convertFromHold` flag: opens the
  existing edit flow on the hold with status defaulted to **Confirmed** and title "Convert Hold
  to Booking". Saving runs `updateBooking` on the same row, so the confirmation number is
  preserved (no orphan/duplicate booking). Conflict check excludes the row's own id.
- `src/app/(app)/bookings/BookingsClient.tsx` — the Edit (pencil) on a `status==='hold'` row
  now opens the editable `BlockModal`; its Convert button closes it and opens `BookingModal`
  with `convertFromHold`. Non-hold rows are unchanged.

Reuses Task 2's "prefill the booking dialog" idea, but for a hold the row already *is* a
booking, so converting edits-in-place rather than creating a new record.

**Test:** `npx tsc --noEmit` clean. Manual: Bookings → a hold row → Edit → "Edit Hold" modal
with **UPDATE HOLD** + **CONVERT TO BOOKING**. (a) UPDATE HOLD → change rooms/dates/expiry →
stays On Hold with edits saved. (b) CONVERT TO BOOKING → booking modal opens prefilled, status
= Confirmed → add rate / Save → same confirmation # now Confirmed, no longer a hold. Creating
a new block (Block Rooms button) still works unchanged.

## Task 7 — Calendar for Preferred Date — already implemented (verified, no change)

The enquiry "Preferred Check-in Date" field is **already a native `<input type="date">`**
(`EnquiryModal.tsx:187`, `min={today}`), matching the date inputs used in New Booking — the
project's date-picker convention (there is no shadcn `Calendar`). It stores an ISO date string
in the existing `preferred_dates` text column. The Phase-0 note assumed free-text from the
field's `string` *type*; the actual input was already a date picker. No other surface collects
a preferred date. Left display formatting untouched to avoid mangling any legacy non-ISO values
(`fmtDate` on "12-15 June" → "NaN/NaN/NaN").

**Test:** verified by inspection — the only preferred-date entry point is the modal's date
input. No code change made.

## Task 8 — Auto-set Departure to day after Arrival

When Arrival changes, Departure now defaults to the next day (Arrival + 1) **when it's empty
or no longer after Arrival**; an already-chosen longer stay is preserved, and the user can
still override Departure. Previously the modals only recomputed `nights`, so picking an arrival
on/after the current departure produced 0 nights and a "Departure must be after arrival" error.

- `src/components/bookings/BookingModal.tsx`
- `src/components/bookings/BlockModal.tsx`
- `src/components/corporate/CorporateBookingModal.tsx`

Each gains a `handleArrivalChange` (sets arrival, conditionally bumps departure via
`addDays(v, 1)`) wired to the arrival date input. The existing nights-recompute effect then
updates nights. Enquiry has only a single "Preferred Check-in Date" (no departure), so it's
not applicable. Lexicographic `<=` on `YYYY-MM-DD` strings is chronological; `addDays` is
date-only so no timezone drift.

**Test:** `npx tsc --noEmit` clean. Manual: New Booking → set Check-in to a future date past
the current Check-out → Check-out snaps to the day after, Nights = 1; then set a multi-night
Check-out and nudge Check-in earlier → the longer stay is kept. Same in Block Rooms and the
Corporate booking modal.

## Task 9 — Make the Verify tab bigger

`src/app/(app)/accounts/AccountsClient.tsx` — the Accounts sub-tabs (Pending Verification /
Full Ledger / BTC Receivables) all shared `px-4 py-2 text-sm`. Gave **Pending Verification**
more weight: `px-6 py-3 text-base font-semibold`, an amber pill **count badge** (instead of an
inline "(n)") shown when there are pending payments, and amber text when inactive-with-pending
to pull the eye. Ledger/BTC unchanged. Container is now `items-end` so the taller tab's bottom
border still aligns.

**Test:** `npx tsc --noEmit` clean. Manual (as Accounts/Admin): the Verify tab is visibly
larger/bolder; with pending payments it shows an amber badge with the count and amber text when
not selected. Switching tabs still works.

## Task 10 — Calendar month name + navigation (verify date logic)

Month name display and prev/next/today navigation were **already present and correct**
(`OccupancyHeader` renders `monthLabel`; `CalendarClient` wires `onPrev/onNext/onToday` to
`setMonthOffset`). The month math is sound: `d.setDate(1)` before `setMonth(+offset)` avoids the
month-overflow off-by-one. Likely fixed in the earlier "calendar revamp" commit.

Per the task's request to verify the underlying date logic, I found and fixed a real
**timezone off-by-one**:

- `src/app/(app)/calendar/CalendarClient.tsx` — `today` was `isoDate(new Date())` (UTC), but the
  day cells and stored booking dates are local `YYYY-MM-DD`. In +UTC zones (resort is IST) before
  05:30 local, UTC `today` is a day behind, so the "today" column highlight and the today-KPIs
  (check-ins / check-outs / occupancy) pointed at the wrong day. Now computed from local date
  parts to match the cells. (The `isoDate(endDate)` at line 186 is a UTC parse+format round-trip
  on an already-`YYYY-MM-DD` string — cancels out, no bug; left as-is.)

**Test:** `npx tsc --noEmit` clean. Manual: month name shows (e.g. "June 2026"); ◀ / Today / ▶
move between months and re-render bars; the green "today" column lands on the correct local day
(verifiable in IST early-morning, where it was previously a day behind).

## Task 11 — View Voucher

Voucher rendering already existed (`/api/print/voucher` → `buildVoucherHTML`); the existing
buttons just auto-fired `window.print()`. Added a **View** action that opens the same rendered
voucher in a new tab *without* forcing print, so it can be previewed/read (and saved as PDF via
the browser). Reuses the existing generator — no new render path.

- `src/app/(app)/bookings/BookingsClient.tsx` — `handleView` + an Eye button beside the print
  button on each booking row (same Sales/FO/Admin gating as print).
- `src/app/(app)/vouchers/VouchersClient.tsx` — `handleView` + a VIEW button next to PRINT
  VOUCHER on each voucher card.

**Test:** `npx tsc --noEmit` clean. Manual: Bookings row → Eye / Vouchers card → VIEW opens the
voucher in a new tab and does **not** trigger the print dialog; PRINT still opens-and-prints.

## Task 12 — Editable voucher (role + 12h rule + audit log)

Decisions (best practice / business need): **edit the booking fields** the voucher renders
(single source of truth, no divergent copy); **Sales + Admin** may edit (Admin retains the
app's universal override); cutoff = **12h before a 2pm check-in, in IST** (resort tz, fixed
offset so client and server agree regardless of host tz); audit log is **append-only**.

- `src/lib/utils/voucher.ts` (new) — `isVoucherEditable(arrival)` / `voucherEditLockMs`.
  Anchors check-in to `RESORT_CHECK_IN_HOUR=14` at `RESORT_UTC_OFFSET_MIN=330` (IST), minus
  `VOUCHER_EDIT_LEAD_HOURS=12`. Computed in UTC ms so the lock is identical in UI + server.
- `src/lib/utils/conflict.ts` (new) — extracted `checkRoomConflict` from `bookings.ts` into a
  shared util so booking edits and voucher edits enforce the same double-booking rule.
  `bookings.ts` now imports it (local copy removed).
- `src/lib/actions/vouchers.ts` — new `updateVoucher(bookingId, fields)` server action:
  auth → **Sales/Admin** role check → **12h lock** (based on the booking's stored arrival) →
  room-conflict check when rooms/dates change → update (merges over the full booking so
  `bookingToDb` defaults can't clobber columns) → **audit** to `booking_history` with
  `changed_by_id` (user id), `changed_at`, per-field `{from,to}` for all voucher fields, and a
  snapshot → revalidate.
- `src/components/bookings/BookingModal.tsx` — new `voucherEdit` flag: save routes to
  `updateVoucher`, title "Edit Voucher", toast "Voucher updated". Reuses the existing form.
- `src/app/(app)/vouchers/VouchersClient.tsx` — per card, Sales/Admin see an **EDIT** button
  when `isVoucherEditable(arrival)`, else a disabled **lock** icon ("editing closes 12 hours
  before check-in"). Opens `BookingModal` with `voucherEdit`.
- `src/app/(app)/vouchers/page.tsx` — also loads the staff list for the modal's agent field.
- `supabase/migrations/003_voucher_audit.sql` — **NEEDS TO BE RUN MANUALLY.** Adds
  `booking_history.changed_by_id` and makes the audit log append-only (RESTRICTIVE no-UPDATE /
  no-DELETE). ⚠ Until run, voucher edits still save but the audit insert fails (logged,
  non-fatal) because the column is missing.

**Test:** `npx tsc --noEmit` clean; new files lint-clean (pre-existing `BookingModal` lint debt
unrelated). Manual (after running migration 003): as Sales/Admin, Vouchers → a future booking
shows **EDIT** → change a field → Save → "Voucher updated"; a `booking_history` row appears with
your user id + before/after. A booking within 12h of check-in (or past) shows the **lock** and
`updateVoucher` rejects if called. As a non-Sales/Admin role, no EDIT button and the action is
refused server-side.

---

# Second batch — 7-feature request

Several of these overlapped already-shipped tasks (calendar nav = Task 10, voucher 12h lock =
Task 12). Only the genuine gaps were built; overlaps are noted as verified.

## F1 + F4 — Eye icon → read-only Enquiry Details dialog

New **eye button** on every enquiry row opens a read-only details dialog. Shows Lead #, name,
phone, email, dates (dd/mm/yyyy), source, type, rooms, preferred check-in, stage, owner,
follow-up, next action, notes, and a created/updated footer. **Lost** leads get a prominent
red **"Reason for Loss"** card (with the lost-on date). Dialog closes via the X, the CLOSE
button, backdrop click, or **Escape**. Visible to all roles (read-only).

- `src/components/enquiries/EnquiryViewModal.tsx` (new) — the dialog.
- `src/app/(app)/enquiries/EnquiriesClient.tsx` — `Eye` import, `viewEnquiry` state, eye button
  as the first action in each row, modal render (lazy `dynamic`, matching `EnquiryModal`).

There is no "quoted amount" on the enquiry entity, so that line from the spec is N/A here (the
"Quoted Amount" field lives on the hold/block form — see F5).

## F2 — dd/mm/yyyy everywhere

`fmtDate` already produced dd/mm/yyyy and is used across tables/dialogs. Added:

- `src/lib/utils/date.ts` — new **`fmtDateTime`** (dd/mm/yyyy HH:mm) for timestamps (used by the
  voucher edit log, F7). Both `fmtDate`/`fmtDateTime` now guard `NaN` and return the original
  string for legacy free-text instead of "NaN/NaN/NaN".

### F2 follow-up — date INPUTS now show dd/mm/yyyy too

The first pass only fixed *display* text; the native `<input type="date">` controls still rendered
in the browser locale (e.g. mm/dd/yyyy on a US-locale browser). Fixed with a reusable control:

- `src/components/ui/DateInput.tsx` (new) — shows the value as **dd/mm/yyyy** (via `fmtDate`) in a
  styled box; a transparent native `<input type="date">` is overlaid only to hold the value +
  min/max and to open the OS calendar picker (`showPicker()` on click, focus fallback). Optional
  `clearable` × for emptying optional dates. Value stays ISO `YYYY-MM-DD`, so no downstream logic
  changed.
- Swapped into **every** date input: `BookingModal` (via its `Field` helper), `BlockModal`,
  `CorporateBookingModal`, `EnquiryModal` (×3), `PaymentModal`, `FinalBillModal` (×2),
  `ReportsClient` (from/to), and admin `SettingsClient` (×2).

⚠ Remaining: `<input type="datetime-local">` (only the hold-expiry field in `BlockModal`) still
renders date+time in browser locale — not wrapped, since it carries a time component the simple
date control doesn't model. Flag if you want that one converted too.

## F3 — Calendar current month + navigation — already done (Task 10), verified

`CalendarClient` + `OccupancyHeader` already default to the current month and provide
◀ / Today / ▶ with a "Month YYYY" label and unrestricted range. No change.

## F5 — Quoted Amount blank by default (not 0)

`src/components/bookings/BlockModal.tsx` — the **Quoted Amount (₹)** field now defaults to an
empty string (placeholder "—") instead of `0`; an existing hold with amount 0 also shows blank.
On save, blank → `0` for storage; a filled value is validated as a **non-negative number**
(rejects negatives/NaN with a toast). Both the create and edit paths convert before submit so the
Zod `quotedAmount: number` contract is preserved.

(Scope note: only the literal "Quoted Amount" input was changed. Booking/hold totals elsewhere
were left untouched — a hold legitimately storing 0 is not necessarily "blank," so reskinning all
₹0 cells to "—" was out of scope to avoid regressions.)

## F6 — Verify button (replace the verified tick)

`src/app/(app)/accounts/AccountsClient.tsx` — the icon-only verify control is now a labelled
**VERIFY** button (emerald, `CheckCircle2 + "VERIFY"`) in both the Pending Verification tab and
the Full Ledger. In the ledger, a verified row shows a green **"Verified ✓"** label (with a small
un-verify affordance for Accounts/Admin). Success/error already surface via sonner toasts
(unchanged). No pre-verify confirm dialog added — verification is reversible (un-verify), so a
blocking confirm would only add friction; the destructive **Delete** keeps its confirm.

## F7 — Voucher edit log display

The 12h lock + append-only audit to `booking_history` already shipped (Task 12). Added the
**display** the spec asked for:

- `src/lib/actions/vouchers.ts` — new `getVoucherHistory(bookingId)` server action (auth +
  **Sales/Admin** gate) wrapping the existing `getBookingHistory` query; exports a
  `VoucherEditEntry` type.
- `src/components/vouchers/VoucherHistoryModal.tsx` (new) — loads the log on open and renders each
  edit as a card: **editor name + `fmtDateTime` timestamp (dd/mm/yyyy HH:mm)**, then per-field
  **old → new** diffs (humanised field labels, red strikethrough → emerald). Escape/backdrop
  dismiss.
- `src/app/(app)/vouchers/VouchersClient.tsx` — a **History** (clock) button per voucher card for
  Sales/Admin opens the modal.

Decision: reused `booking_history` rather than adding a separate `voucher_edit_logs` table — the
audit trail already lives there (single source of truth, append-only via migration 003).

**Verification (whole batch):** `npx tsc --noEmit` clean (exit 0). New files lint-clean; the only
eslint findings in touched files are the pre-existing `Date.now()`-in-render / `setState`-in-effect
/ `useMemo`-dep patterns that predate this work (documented above). No automated test suite — manual
steps per feature above. Not run against live Supabase. Working tree left **uncommitted** per your
request.

---

# Third batch — Corporate Menu + corporate rules + cost-sheet PDF

Business requirements: (1) a Menu (incl. Snacks) in the Corporate section, (2) no deleting records
in the Corporate section — edit only, (3) a PDF option in the cost sheet.

## Corporate Menu (single standard menu, guest-facing PDF)

A standard menu the resort maintains, organised into category sections (Snacks, Starters, Main
Course, Breads & Rice, Beverages, Desserts), printable as a branded guest-facing doc. Reached from
a **MANAGE MENU** button on the Corporate page → `/corporate/menu`.

- DB: `supabase/migrations/004_menu_items.sql` (**run manually**) — `menu_items` table; permissive
  RW for authenticated + a RESTRICTIVE no-DELETE policy (records are never deleted, only archived).
- Full stack mirroring the app pattern: `types/menu.ts`, `constants/menu.ts`, `mappers/menu.ts`,
  `queries/menu.ts` (`getMenuItems`), `validations/menu.ts`, `actions/menu.ts`
  (`createMenuItem` / `updateMenuItem` / `setMenuItemActive` — **Sales/Admin** only).
- UI: `src/app/(app)/corporate/menu/{page.tsx,MenuClient.tsx}` — items grouped by section, add/edit
  modal, **archive/restore** (no destructive delete, per rule #2), VIEW + PRINT/PDF.
- Print: `src/app/api/print/menu/route.ts` + `src/lib/utils/menuPrint.ts` (`buildMenuHTML`) —
  branded HTML grouped by section with veg/non-veg marks, optional prices; opens to print / save PDF.
- Per-item: name (req), price (₹, optional — blank hides price), veg/non-veg, description.

## No delete in Corporate section (edit only)

- `src/app/(app)/corporate/CorporateClient.tsx` — removed the booking **delete** (trash) button +
  `handleDelete` + `deleteBooking`/`Trash2` imports. Edit remains.
- `src/lib/actions/bookings.ts` — `deleteBooking` now refuses `booking_type = 'corporate'`
  server-side (defense in depth, same spirit as the enquiry delete lock).

## Cost-sheet PDF

- `src/components/corporate/CostSheetModal.tsx` — a **PDF** button in the footer opens the saved
  cost sheet via the existing `/api/print/cost-sheet` route (print / save as PDF).
- `CorporateClient` — also surfaced a **CS PDF** button per row when a cost sheet exists (wires the
  previously-unused `handlePrintCostSheet`).

**Process note:** went through the brainstorming skill (clarified Menu = guest-facing doc, single
standard menu, one menu with Snacks as a section). Skipped the formal spec-doc/commit step since you
directed implementation directly and the working tree is being kept uncommitted.

**Verification:** `npx tsc --noEmit` clean (exit 0); new files lint-clean (only the pre-existing
`pStats` useMemo-dep warning in `CorporateClient`). ⚠ **Run migration 004** before using the menu.
Not run against live Supabase.

---

# Corporate module rebuild — Phase 1: pipeline engine & activity log (corporate only)

First slice of the "world-class corporate booking" spec. Decomposed into 5 phases; this is the
backbone the rest reads from. **Corporate bookings only** — all hooks guard `booking_type`.

## Stage machine
Added the two missing stages so the model matches the pipeline: `…advance_paid → **confirmed** →
**checked_in** → completed`. Updated `CorporateStage` (`types/booking.ts`), `CORPORATE_STAGES`
labels/colors/step + order, and a `corporateStageStep()` helper (`constants/corporate.ts`).
`getEffectiveStatus` now counts `confirmed/checked_in/completed` as room-consuming.

## Automation (forward-only, corporate-only)
`src/lib/server/corporateEngine.ts` (new):
- **Verified advance → Confirmed.** When a payment is verified (or FO auto-verified), if cumulative
  **verified** ≥ the PI's `advanceRequired` (fallback: any verified payment when no PI), the booking
  auto-moves to **Confirmed** and sets booking `status='confirmed'` → consumes calendar inventory.
- **Final bill fully settled → Completed.**
- Forward-only by step number; never regresses; never downgrades an already checked-in stay.
Hooked into `actions/payments.ts` (`verifyPayment` + FO auto-verify path in `addPayment`).

## Manual transitions + admin override
`actions/corporate.ts`: `checkInCorporate` (Confirmed→Checked-In, FO/Sales/Admin), `completeCorporate`
(→Completed), and **admin-only** `setCorporateStage` override. Row buttons: **CHECK-IN** (confirmed)
and **COMPLETE** (checked-in); GEN PI now hides once a PI exists.

## Append-only activity log
`supabase/migrations/005_corporate_activity.sql` (**run manually**) — `corporate_activity` table,
permissive RW + RESTRICTIVE no-UPDATE/no-DELETE (never edited/deleted). `logCorporateActivity()`
wired into every corporate action (inquiry created, cost sheet updated, quote sent/accepted, PI
generated, payment verified, confirmed, checked-in, completed, admin override). New
`getCorporateActivity` action + **CorporateActivityModal** (timeline, newest-first, dd/mm/yyyy HH:mm,
color-coded; admin stage-override built in) opened from a **History** button per row.

**Out of scope (next phases):** detail page, Kanban, KPI cards, smart alerts, document history, Tax
Invoice.

**Verification:** `npx tsc --noEmit` clean (exit 0); new files lint-clean (only the pre-existing
`pStats` warning). ⚠ **Run migration 005** for activity logging. Not run against live Supabase.

---

# Corporate module rebuild — Phase 2: booking detail page

A full CRM-style detail page at **`/corporate/[id]`** (server `page.tsx` → `CorporateDetailClient.tsx`),
reached by clicking a company name in the list. No new DB — reads the Phase 1 engine + activity log.

- **Header** — company, confirmation #, PI #, stage badge, Edit.
- **Horizontal stage progress bar** — all 9 stages, current highlighted (amber ring), completed green,
  future grey; horizontally scrollable on mobile.
- **Two-column responsive layout** — main cards + a **sticky right rail** (financial summary +
  next-action panel) on desktop, stacking on mobile/tablet.
- **Cards:** Company Information · Stay Information (occupancy breakdown, rooms) · Cost Sheet (summary +
  Build/Edit + PDF) · Documents (Cost Sheet/Quotation, Proforma Invoice view+PDF, Tax Invoice marked
  *coming soon*, payment receipts list) · **Payment Timeline** (PI generated + each payment
  received/verified, from real data) · **Activity Log** (loaded via `getCorporateActivity`).
- **Sticky Financial Summary** — Total Quote Value, Taxes (Included), Advance Required, Advance
  Received, (Unverified), Outstanding — color-coded green/amber/red.
- **Sticky Next-Action panel** — one stage-aware recommended action (Create Cost Sheet → Send Quote →
  Mark Accepted → Generate PI → Record Advance → Check-In → Complete), gated by role; reuses the
  Phase 1 actions and existing modals (cost sheet, payment, edit, PI preview).

Reservation execs can now open a booking and read company / dates / revenue / payment / stage / next
action at a glance — the Phase 2 success criteria.

**Out of scope (next phases):** list Kanban + richer filters (3), dashboard KPIs + smart alerts (4),
document history + Tax Invoice generation (5).

**Verification:** `npx tsc --noEmit` clean (exit 0); new files lint-clean. No new migration. Not run
against live Supabase.

---

# Corporate module rebuild — Phase 3: list, filters & Kanban

Upgraded the corporate list (`CorporateClient.tsx`) into a CRM-grade pipeline view. No new DB.

- **Table/Kanban toggle.**
- **Richer table columns:** Company, Contact, Arrival, Departure, Rooms, Value, **Advance status**
  pill (Paid/Partial/Unverified/Pending, color-coded), color-coded **Stage**, Owner, **Last Activity**
  (newest `corporate_activity` per booking — server query `getLatestActivityByBooking`, with the
  message as a tooltip), and **Next Action** (stage-derived hint). Company name links to the detail page.
- **Filters:** search, **Stage**, **Company** (dropdown), **Arrival date range** (dd/mm/yyyy pickers),
  **Min revenue** (₹), a Clear-filters reset, and a live "{n} of {total}" count.
- **Kanban view:** 8 columns (Inquiry → Draft → Quote Sent → Accepted → PI/Advance → Confirmed →
  Checked-In → Completed); cards show company, confirmation #, arrival, rooms, value + advance pill,
  per-column count and total value; click a card to open the detail page. Read-only by design — stages
  move only via workflow + automation + admin override (per the business rule), so no drag-drop.
- Server: new `getLatestActivityByBooking` query; `page.tsx` passes `lastActivity` to the client.

**Out of scope (next phases):** dashboard KPI cards + smart alerts (4), document history + Tax Invoice
generation (5).

**Verification:** `npx tsc --noEmit` clean (exit 0); only the pre-existing `pStats` useMemo-dep warning.
No new migration. Not run against live Supabase.
