# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Next.js 16 + React 19.** This repo runs bleeding-edge versions. APIs and
> conventions differ from older Next.js — when in doubt, read the bundled guides
> in `node_modules/next/dist/docs/` before writing code. The React Compiler
> (`babel-plugin-react-compiler`) is enabled, so avoid manual `useMemo`/`useCallback`
> micro-optimizations.

## Commands

```bash
npm run dev      # start dev server (http://localhost:3000)
npm run build    # production build — run this to typecheck the whole project
npm run lint     # eslint (next/core-web-vitals + next/typescript)
npm start        # serve a production build
```

There is no test suite. `npm run build` is the de-facto typecheck/CI gate — TypeScript
runs in `strict` mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`,
so indexed access yields `T | undefined` and optional props cannot be set to `undefined`.

Environment lives in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and a service-role key used by `src/lib/supabase/admin.ts`.

## What this is

A CRM for Baghaan resort: enquiries → bookings → payments → vouchers/final bills,
plus a corporate/group pipeline (cost sheet → proforma invoice → advance), an
occupancy calendar, and role-scoped dashboards. Hindi/Indian-hospitality domain
(GST, BTC = Bill-To-Company, PI = proforma invoice).

## Architecture

**Stack:** Next.js 16 App Router · React 19 · Supabase (Postgres + Auth) · Tailwind v4 ·
Zod v4 · react-hook-form · framer-motion · sonner (toasts) · `@react-pdf/renderer` (PDFs).
Path alias `@/*` → `src/*`.

### Request/data flow — the core pattern

This codebase follows a strict layered server-first flow. Mirror it for new features:

1. **`page.tsx` (Server Component)** — authenticates via `supabase.auth.getUser()`,
   redirects to `/login` if absent, fetches initial data through the queries layer
   (often with `Promise.all`), and passes it to a client component as `initial*` props.
2. **`*Client.tsx` (Client Component)** — owns interactivity, holds the data in
   `useState` seeded from the `initial*` props, opens modals, calls Server Actions.
3. **`src/lib/queries/*`** — read-only fetchers (`getBookings`, `getPayments`, …).
   Server-only. Each returns mapped domain types, never raw DB rows.
4. **`src/lib/actions/*`** — `'use server'` mutations. Validate input with a Zod schema
   from `src/lib/validations/*`, re-check auth/role inside the action, write via Supabase,
   then `revalidatePath(...)` the affected routes. Return an `ActionResult<T>`.
5. **`src/lib/mappers/*`** — translate between snake_case DB rows and camelCase domain
   types (`dbToBooking` / `bookingToDb`). **All DB ↔ app boundary crossings go through a
   mapper** — clients never see snake_case.

### Key conventions

- **`ActionResult<T>`** (`src/lib/types/result.ts`): every Server Action returns
  `{ success: true, data }` or `{ success: false, error }`. Build with `ok(data)` /
  `err(message)`; never throw across the action boundary. Clients branch on `.success`
  and surface `.error` via a sonner toast.
- **Auth is checked at every layer** — middleware, the route-group `layout.tsx`, the
  `page.tsx`, *and* inside each Server Action (`getAuthedUser` helper). Don't assume an
  upper layer already guarded it.
- **Roles & permissions:** roles are defined in `src/lib/types/profile.ts` (`ALL_ROLES`,
  12 roles; `OPERATIONAL_ROLES`, the 7 read-only ops roles).
  `usePermissions()` (`src/hooks/usePermissions.ts`)
  derives boolean capabilities for the client; `DEFAULT_TAB_BY_ROLE` and `ALL_TABS`
  (`src/lib/constants/roles.ts`) drive landing pages and nav visibility. Permission
  checks in actions must be re-implemented server-side — the hook is UI-only.
- **Supabase clients** — three entrypoints, pick deliberately:
  `src/lib/supabase/server.ts` (`createClient`, cookie-bound, respects RLS, default for
  pages/queries/actions), `src/lib/supabase/client.ts` (browser), and
  `src/lib/supabase/admin.ts` (service-role, bypasses RLS — admin-only, e.g. inviting users).

### Routing

App Router with three route groups under `src/app/`:
- `(auth)` — `/login` (public).
- `(app)` — main authenticated CRM; its `layout.tsx` loads the profile and wraps children
  in `AppShell` (header + role-aware `NavTabs` + sonner `Toaster`) via `UserProvider`.
- `(admin)` — `/admin/*`; gated a second time in `middleware.ts` (DB role check, Admin only).

`middleware.ts` (repo root) enforces auth globally, redirects authed users away from
public routes, and skips `/api/export` & `/api/print` (those handlers check auth themselves).

API routes (`src/app/api/`) generate documents two ways: HTML **print** views rendered
server-side (`/print/voucher|cost-sheet|pi|menu`, printed from the browser) and true binary
**PDFs** via `@react-pdf/renderer` (`/pdf/cost-sheet`, `/pdf/pi`, `runtime = 'nodejs'`, React
components + registered fonts in `src/lib/pdf/`). They also handle CSV **exports**
(`/export/bookings|payments|enquiries`), the Supabase auth **callback**, voucher viewing
(`/voucher/view`), and an admin conflict-repair endpoint (`/admin/fix-conflicts`).

### Domain notes

- **Bookings** carry `status` (confirmed/hold/checked_in/checked_out/cancelled) and a
  `bookingType` (regular/corporate). Corporate bookings advance through `corporateStage`
  (inquiry → cost_sheet → PI → advance → completed) with embedded `costSheet` /
  `proformaInvoice` / `finalBill` JSON. Hold bookings expire via `holdExpiresAt`.
- **Room double-booking is prevented** by `checkRoomConflict` in
  `src/lib/actions/bookings.ts` using a Postgres array-overlap + date-overlap query —
  preserve this check when touching booking create/update.
- Confirmation numbers are generated from a `meta.booking_counter` row (see
  `getCounter`/`saveCounter`); booking edits are journaled to a `booking_history` table.
- **Corporate automation** lives in `src/lib/server/corporateEngine.ts` (`server-only`):
  `runCorporateAutomation` advances `corporateStage` on triggering events and
  `logCorporateActivity` appends to the `corporate_activity` audit table (never throws —
  logging must not break its caller). Invoked from the `corporate` and `payments` actions,
  not from clients.
- DB schema changes live in `supabase/migrations/` (numbered `000`–`008`, plus
  `full_setup.sql` and `performance_indexes.sql`).
