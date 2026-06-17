# Baghaan CRM → Multi-Tenant SaaS — Design & Implementation Plan

**Date:** 2026-06-15 · **Status:** Plan for review (no code written yet)
**Single source of truth.** Merges the earlier design draft and robust plan.

---

## 1. Goal & locked decisions

Convert the single-tenant Baghaan resort CRM into a multi-tenant SaaS so multiple
resorts use one application, each seeing only its own data.

| Decision | Choice | Why |
| --- | --- | --- |
| Destination | Self-serve SaaS (resorts sign up + pay online) | Long-term product goal |
| Data isolation | Shared DB + Postgres RLS (`resort_id` on every table) | Lowest cost/ops; idiomatic for Supabase; scales to hundreds of tenants |
| Tenant routing | Single domain + org switcher (tenant from the logged-in user) | Simplest; staff belong to one resort |
| Billing | Deferred / manual at first | Build tenant + plan-limit infra now, wire payments later |
| Onboarding | Manual super-admin first; self-serve later | De-risks isolation before signup/billing |

**Non-negotiable:** every phase ships independently and leaves Baghaan 100% working.
**Practical consequence:** Phase 1 is really "a multi-tenant foundation you onboard manually." Self-serve signup and payments layer on top later (Phases 2–3).

---

## 2. Current architecture (facts to design around)

- **Stack:** Next.js 16 (App Router) · React 19 · Supabase (Postgres + Auth + RLS) · Tailwind v4 · Zod v4 · TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Layered server-first flow:** Server Component `page.tsx` (auth + fetch) → client component → read-only **queries** layer → `'use server'` **actions** (Zod-validated, return `ActionResult<T>`) → **mappers** (snake_case DB ↔ camelCase domain).
- **Auth checked at every layer** (middleware, layout, page, and inside each action).
- **Three Supabase clients:** cookie-bound (respects RLS, default), browser, service-role (bypasses RLS, admin only).
- **No tenant boundary today:** all tables global; RLS fully permissive (`USING (true)`). Counters global. Rooms/rates hardcoded. Roles are a single global field on `profiles`.
- **Key enabler:** queries/actions already use the RLS-respecting client, so tightening RLS auto-scopes most reads.

### Measured blast radius (counted in this repo)

| Surface | Where | Count |
| --- | --- | --- |
| Inserts needing `resort_id` | `src/lib/actions/*` | **28 `.insert()` across 11 files** (bookings 7, enquiries 8, requests 4, payments 2, +7 single-insert files) |
| Counters → per-resort | bookings.ts, corporate.ts, enquiries.ts, queries/dashboard.ts, validations/admin.ts | 5 files |
| Hardcoded rooms/rates | constants/rooms.ts + BookingModal, CorporateBookingModal, BlockModal, CalendarClient, utils/print.ts | 6 files |
| Permissive RLS | every table (`USING (true)`) | all |
| Room conflict check | `checkRoomConflict` in actions/bookings.ts | 1 (critical) |
| Print/export reading data + branding | api/print/*, api/export/*, api/pdf/* | several |

This table is the audit checklist — every item closed before a real 2nd tenant.

---

## 3. Target architecture

### 3.1 New tables

```sql
CREATE TABLE resorts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,           -- url-safe handle, future subdomains
  status      text NOT NULL DEFAULT 'active'  -- trial | active | suspended
                CHECK (status IN ('trial','active','suspended')),
  plan        text NOT NULL DEFAULT 'free',   -- free | standard | pro (placeholder)
  plan_limits jsonb NOT NULL DEFAULT '{}',    -- { maxUsers, maxRooms, ... }
  gst_number  text NOT NULL DEFAULT '',
  address     text NOT NULL DEFAULT '',
  branding    jsonb NOT NULL DEFAULT '{}',    -- logo url, colors, voucher header
  settings    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resort_id  uuid NOT NULL REFERENCES resorts(id)    ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'Sales',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, resort_id)
);

CREATE TABLE rooms (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_id    uuid NOT NULL REFERENCES resorts(id) ON DELETE CASCADE,
  name         text NOT NULL,        -- "Orchard Cottage 1"
  category     text NOT NULL,        -- "Orchard Cottage"
  default_rate numeric NOT NULL DEFAULT 0,
  active       boolean NOT NULL DEFAULT true,
  UNIQUE (resort_id, name)
);
```

> **`memberships` vs a `resort_id` on `profiles`:** a join table lets one user (platform owner / multi-property operator) belong to several resorts. Staff have exactly one membership. `memberships.role` supersedes `profiles.role`; `profiles` keeps identity (name, email).

### 3.2 Tenant column on existing tables

Add `resort_id uuid REFERENCES resorts(id)` to every tenant-scoped table: `enquiries, bookings, payments, booking_history, voucher-audit, menu_items, corporate-activity, requests`, and any other data table.

Migrate `meta` from global key/value to per-resort counters:

```sql
ALTER TABLE meta ADD COLUMN resort_id uuid REFERENCES resorts(id);
-- backfill existing rows to the Baghaan resort, then:
ALTER TABLE meta DROP CONSTRAINT meta_pkey,
  ADD PRIMARY KEY (resort_id, key);
```

Each resort gets its own `booking_counter` starting at 1.

### 3.3 RLS model

```sql
CREATE OR REPLACE FUNCTION current_resort_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT resort_id FROM memberships WHERE user_id = auth.uid();
$$;

DROP POLICY IF EXISTS "bookings_all" ON bookings;
CREATE POLICY "bookings_tenant" ON bookings
  FOR ALL TO authenticated
  USING      (resort_id IN (SELECT current_resort_ids()))
  WITH CHECK (resort_id IN (SELECT current_resort_ids()));
```

- **Staff (1 membership):** airtight — only their resort's rows.
- **Multi-resort user:** RLS permits all theirs; the app additionally scopes every query to the active resort (3.4).
- **Super-admin / platform ops:** use the service-role client (bypasses RLS) and must filter `resort_id` manually.

> Membership-set approach preferred over JWT-claim "active tenant" switching — simpler, no custom access-token hook. Can move to request-scoped `set_config`/JWT later without changing the table design.

### 3.4 Application layer

- **`getActiveResort()`** — server helper: reads active resort id from a cookie, validates against memberships, returns `{ resortId, role }`; defaults to the sole membership.
- **Stamp `resort_id` on all 28 inserts** (mappers + actions). RLS scopes reads; inserts must set it explicitly.
- **Defense-in-depth reads** — add `.eq('resort_id', resortId)` alongside RLS (and to pick the active resort when a user has several).
- **Counters** become resort-scoped — `getCounter`/`saveCounter` take `resortId`.
- **`checkRoomConflict`** — add `resort_id` to the conflict query (else phantom cross-resort conflicts).
- **Rooms & rates** — load from the `rooms` table (cached per request); the constants file becomes seed data.
- **`usePermissions()` / role** — derive from the active membership, not `profiles.role`.

---

## 4. Phased plan (each phase = shippable, with tasks + acceptance)

### Phase 0 — Schema foundation *(invisible to Baghaan)*
**Tasks (ordered: add nullable → backfill → enforce → lock down):**
1. Migration `009`: create `resorts`, `memberships`, `rooms`.
2. Insert resort "Baghaan"; seed its `rooms` from `ROOM_INVENTORY`/`DEFAULT_RATES`.
3. Add **nullable** `resort_id` to every tenant table + `meta`.
4. Backfill `resort_id = <Baghaan id>` on all rows; create a membership per profile (role copied).
5. Set `resort_id NOT NULL`; switch `meta` PK to `(resort_id, key)`.
6. Add `current_resort_ids()`; swap permissive policies for tenant-scoped ones.

**Acceptance:** migrations run clean; Baghaan behaves identically; a probe as a Baghaan user returns only Baghaan rows. **Rollback:** policies revert to `USING (true)`; columns stay nullable until step 5 verified.

### Phase 1 — App scoping *(onboard resort #2 by hand)*
**Tasks:**
1. `getActiveResort()` + read it in `(app)/layout.tsx`, queries, actions.
2. Stamp `resort_id` on all 28 inserts.
3. `getCounter`/`saveCounter` take `resortId` (5 files).
4. Add `resort_id` to `checkRoomConflict`.
5. Load rooms/rates from `rooms` table (cached); retire constants usage in the 6 files.
6. Derive role/permissions from membership.
7. Super-admin console + invite-with-`resort_id` (extends service-role invite flow).
8. Scope print/export/pdf routes by resort + per-resort branding (incl. resort name in headers).

**Acceptance:** create "Resort #2", invite a user, log in → see only Resort #2 data, own numbers from 1, own rooms, own name in header. Baghaan unaffected. `npm run build` green.

### Phase 2 — Self-serve onboarding
**Tasks:** public signup → one transaction creates resort + owner membership + seeded rooms/config; resort settings & branding UI; new `Owner` role (above operational `Admin`); plan-limit enforcement in actions.
**Acceptance:** a new resort signs up end-to-end with zero admin action and lands on a working dashboard.

### Phase 3 — Billing
**Tasks:** Razorpay subscriptions (INR/UPI/GST); lifecycle trial → active → suspended; suspended = read-only in actions + UI.
**Acceptance:** payment success activates; failure/cancel suspends to read-only; no data loss.

| Phase | Outcome | Rough effort |
| --- | --- | --- |
| 0 | Isolation in place, invisible to Baghaan | S–M |
| 1 | Onboard tenant #2 manually | L |
| 2 | Tenants self-serve | M |
| 3 | Paid SaaS | M |

All numbered SQL migrations live in `supabase/migrations/` (next: `009_…`).

---

## 5. Verification strategy (per phase)

- **Build gate:** `npm run build` (strict TS) must pass.
- **Isolation probe:** as a single-membership user, every list view + export returns only that resort's rows; a cross-resort id read is blocked by RLS.
- **Insert audit:** grep `.insert(` → all 28 stamp `resort_id`; an insert without it must fail RLS `WITH CHECK` (fail-loud is correct).
- **Conflict check:** same dates/rooms in two resorts must NOT collide.
- **Counters:** resort #2's first booking number = 1.
- **Regression:** Baghaan end-to-end smoke (enquiry → booking → payment → voucher → checkout) unchanged.

---

## 6. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| An insert forgets `resort_id` | RLS `WITH CHECK` fails loud; `.insert(` grep is the checklist |
| Cross-resort phantom conflicts | Add `resort_id` to `checkRoomConflict` (Phase 1, task 4) |
| `getRoomCategory` prefix-match assumes Baghaan names | Store `category` explicitly in `rooms` |
| Service-role/admin code bypasses RLS | Every admin query filters `resort_id` manually |
| Print/export leak across tenants or wrong branding | Scope those routes by resort (Phase 1, task 8) |
| Strict TS build breaks on new optional fields | Conditional spreads, not `= undefined`; guard indexed access |

---

## 7. Out of scope (YAGNI)
Subdomains / wildcard DNS · schema-per-tenant or DB-per-tenant · white-labeling beyond basic branding · usage-metered / per-seat billing.

---

## 8. Recommended starting point
Do **Phase 0** in full and stop. It puts real isolation in place with zero user-visible
change, so it can be verified against live Baghaan before any second tenant exists.
Only then begin Phase 1.
