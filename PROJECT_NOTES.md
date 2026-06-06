# PROJECT_NOTES.md — Phase 0 Discovery

Discovery pass for the planned CRM enhancement tasks. **Read this before starting any task.**

## 1. Stack & project map

- **Framework:** Next.js **16.2.7** (App Router) + React **19.2.4**, TypeScript strict
  (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). React Compiler is on.
- **DB/Auth:** Supabase (`@supabase/ssr`). Postgres with permissive RLS (see §4).
- **UI:** Tailwind v4 + `lucide-react` icons + `sonner` toasts + `framer-motion`.
  **No shadcn/ui.** **No component library at all** — see §3.
- **Forms:** `react-hook-form` + `zod` are installed, but most modals use plain
  `useState` forms (e.g. `BookingModal`, `EnquiryModal`, `BlockModal`).
- Path alias `@/*` → `src/*`. Single test command is `npm run build` (no test suite).

```
src/
  app/
    (auth)/login
    (app)/{dashboard,enquiries,bookings,corporate,calendar,front-office,
           accounts,vouchers,guests,reports}   ← each: page.tsx (server) + *Client.tsx
    (admin)/admin/{users,settings}
    api/{print/{voucher,cost-sheet,pi}, voucher/view, export/*, auth/callback, admin/*}
  components/{bookings,enquiries,corporate,calendar,front-office,payments,
             guests,notifications,layout}
  lib/
    actions/    ← 'use server' mutations (bookings, enquiries, payments, vouchers, …)
    queries/    ← server-only read fetchers
    mappers/    ← snake_case DB ⇄ camelCase domain (hand-written, NOT generated)
    validations/← zod schemas
    types/  constants/  utils/
  hooks/usePermissions.ts   context/UserContext.tsx
middleware.ts               ← auth gate (root, not in src/)
supabase/migrations/        ← *.sql run manually in Supabase SQL editor
```

## 2. Data-fetching pattern (the prompt left this "unknown" — here it is)

**Server Components + Server Actions. No React Query / SWR / Zustand** (`@tanstack/react-query`
is in package.json but unused in `src/`). The actual pattern, repeated everywhere:

1. `page.tsx` (Server Component) authenticates, calls `lib/queries/*`, passes data to a
   client component as `initial*` props.
2. `*Client.tsx` seeds `useState` from those props (and re-syncs with
   `useEffect(() => setX(initialX), [initialX])`).
3. Mutations call a `'use server'` action in `lib/actions/*` which returns
   `ActionResult<T>` (`{success,data}` | `{success,error}` — never throws).
4. On success the client calls **`router.refresh()`**; the action also calls
   **`revalidatePath(...)`** for the affected routes. That refresh is what re-pulls data.

→ **Task 5 (auto-refresh)** must use this mechanism (`router.refresh()` on tab activation),
**not** `invalidateQueries`/`refetch` as the prompt suggested.

## 3. UI conventions (the prompt assumed shadcn — it does not exist)

- Modals are hand-rolled: `<div className="fixed inset-0 bg-black/50 …">` overlays.
- Dates use native `<input type="date">` / `<input type="datetime-local">`.
- Selects are native `<select>`. Buttons are styled `<button>`. No `Dialog`, `Calendar`,
  `Select`, `Button` primitives exist.
- Design language: emerald-900 / amber palette, `Cormorant Garamond` serif headings,
  uppercase tracked labels. Match this, don't introduce a component library.

→ **Tasks 2, 3, 6, 7, 9** that name shadcn components must be re-read as "reuse the existing
hand-rolled equivalents" (the booking modal, the native date input, the existing dialog
overlay pattern). I'll confirm the substitution per task before building.

## 4. Auth, roles & RLS (critical for Tasks 4 & 12)

- **Roles** (`src/lib/types/profile.ts`): 11 roles; `Sales`, `Front Office`, `Accounts`,
  `Admin` + 7 operational read-only roles. The "sales team role" = **`Sales`**.
- **Authorization is enforced in Server Actions**, not RLS. Each action calls a local
  `getAuthedUser()` then an explicit role allowlist
  (e.g. enquiries gate on `['Sales','Admin']`). `usePermissions()` is **UI-only**.
- **RLS is permissive.** Every table created in `supabase/migrations/001_*` uses
  `FOR ALL TO authenticated USING (true)` (except `notifications`, scoped to owner).
  The base tables (`bookings`, `enquiries`, `payments`, `profiles`, `meta`) predate the repo
  migrations and their RLS is **not in the repo** — I must inspect it live (or you provide it)
  before Tasks 4 & 12. ⚠ `FOR ALL ... USING(true)` **includes DELETE**, so removing the
  delete UI/action alone won't stop a delete at the DB layer — a policy change is needed too.
- **Migrations are applied by hand** in the Supabase SQL editor (no Supabase CLI link, no
  generated types). So the prompt's "regenerate Supabase types" step **does not apply** —
  types/mappers are maintained by hand in `src/lib/{types,mappers}`.

## 5. Per-task findings & touch points

Several tasks are **already partly/fully built**. Status noted so we don't redo work.

| # | Task | Status / key files |
|---|------|--------------------|
| 1 | New Enquiry on Dashboard | Enquiries page + `EnquiryModal` already exist. Dashboard has NEW BOOKING + BLOCK buttons (`DashboardClient.tsx:155-159`). **To do:** add a NEW ENQUIRY button there (Sales/Admin) that opens `EnquiryModal`. Small. |
| 2 | Convert → prefilled booking | Flow **exists**: `convertEnquiryToBooking` → `/bookings?convert=…` URL params → `BookingsClient.tsx:60-68` → `BookingModal` `prefill`. **Gap:** only name/phone/email/remarks map. Enquiry `preferredDates`/`numberOfRooms` are **free-text**, so dates/rooms can't map cleanly — needs a parse/decision. URL-param passing is lossy (design choice to revisit). |
| 3 | Lost reasons | **Already implemented**: `lostDialog` + `LOST_REASONS` select (incl. "Other") + `lost_reason`/`lost_at` columns (`EnquiriesClient.tsx:325`, migration 001 §3). **Gap:** "Other" is just a dropdown option, no free-text box. Minor enhancement; DB ready. |
| 4 | Remove enquiry delete | Remove `handleDelete` + trash button (`EnquiriesClient.tsx:108,310`), remove/guard `deleteEnquiry` (`actions/enquiries.ts:187`), **and tighten enquiries RLS** to forbid DELETE (see §4 — currently permitted). |
| 5 | Auto-refresh on tab activation | Use `router.refresh()` on tab/nav activation (see §2). Page tabs are client filters over already-loaded data; cross-user freshness needs a refetch trigger. |
| 6 | Editable Blocked Room (hold) | Holds = bookings with `status='hold'`. `BlockModal` is **create-only** (`createBlockedRoom`). **To do:** add edit mode → save button reads **"Update Hold"**, plus **"Convert to Booking"** reusing Task-2 mapping. |
| 7 | Calendar for Preferred Date | `EnquiryModal.preferredDates` is a free-text string. Replace with the **native date input** used in `BookingModal` (the project's "date picker"). Decide single date vs range — affects storage format. |
| 8 | Auto-set departure | `BookingModal`/`BlockModal` recompute *nights* on date change but **don't bump departure**. Add: when arrival changes and departure ≤ arrival, set departure = arrival+1 (overridable). |
| 9 | Bigger Verify tab | `AccountsClient.tsx` sub-tab buttons (`SubTab='verify'|'ledger'|'btc'`, line ~79). Enlarge the `verify` button via Tailwind. |
| 10 | Calendar month name + nav | **Appears already working**: `CalendarClient.tsx:84,301-304` computes `monthLabel` + prev/next/today; `OccupancyHeader.tsx` renders them. Needs **runtime verification** — may already be fixed or a subtle TZ bug. |
| 11 | View Voucher | Routes exist: `/api/print/voucher` (print) + `/api/voucher/view` (tokened share). Vouchers page has PRINT (`VouchersClient.tsx`). **To do:** add an in-app "View Voucher" action (likely on bookings) — mostly wiring an existing route. |
| 12 | Editable voucher (role+12h+audit) | **No voucher entity** in DB — vouchers render from booking data, so "edit voucher" = edit booking fields (or add voucher-override fields — design decision). Audit table **`booking_history`** already exists (`changed_by/changed_at/changes/snapshot`, migration 001 §4) — reuse it. Enforce **Sales role** + **≥12h before arrival** in `updateBooking` action **and** UI. Biggest task; needs schema/RLS sign-off first. |

## 6. Working agreement for the task phase

- One task at a time; per task: state files → change → test (or manual steps) → confirm → summarize.
- Any DB change: show **SQL migration + RLS diff before applying**; new migration file in `supabase/migrations/`.
- Follow §2/§3 conventions (Server Actions + `router.refresh()`; hand-rolled UI, no new libs).
- Maintain `CHANGELOG.md` (created when Task 1 starts).
- "Regenerate types" = manually update `src/lib/{types,mappers}` (no codegen).
