# Room Availability Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sales/Admin-only "Check Availability" dialog to the Calendar that shows per-room-type availability (free / on-hold / total + nightly rate) for a chosen check-in→check-out range, computed instantly in the browser.

**Architecture:** A pure function (`computeAvailability`) derives per-type counts from the bookings + maintenance blocks the Calendar already loads. A client modal (`RoomAvailabilityModal`) renders the counts and recomputes live as dates change. `CalendarClient` gains a toolbar button (gated to Sales/Admin via `useCurrentUser`) that opens the modal.

**Tech Stack:** Next.js 16 App Router, React 19 (React Compiler — no manual `useMemo`/`useCallback` for micro-opt; use lazy `useState` initializers for impure defaults like dates), TypeScript strict, Tailwind v4. No test runner — `npm run build` is the typecheck gate; pure logic is checked with a throwaway `node --import tsx` script.

## Global Constraints

- Inventory & rates come ONLY from `src/lib/constants/rooms.ts` (`ROOM_INVENTORY`, `DEFAULT_RATES`, `getRoomCategory`, `RoomCategory`). Never hard-code unit counts. (Kesar Khema 16, Orchard Cottage 29, Premium Orchard Cottage 7, Kothi 2.)
- Booking/maintenance overlap with stay `[checkIn, checkOut)` uses the half-open rule `start < checkOut && end > checkIn` (checkout/`dateTo` day frees the room) — identical to `checkRoomConflict` and the Calendar grid's maintenance treatment.
- "On hold" = `booking.status === 'hold'`. Confirmed-occupied = status `confirmed | checked_in | checked_out`, plus maintenance. Cancelled bookings are ignored.
- Feature visible to roles `Sales`, `Sales Admin`, `Admin` only (UI gate).
- Path alias `@/*` → `src/*`. Date strings are `YYYY-MM-DD`.

---

### Task 1: Availability engine (`computeAvailability`)

**Files:**
- Create: `src/lib/utils/availability.ts`
- Test (throwaway, not committed — `.superpowers/sdd/` is gitignored): `.superpowers/sdd/availability-check.mjs`

**Interfaces:**
- Consumes: `Booking` (`@/lib/types/booking`), `ROOM_INVENTORY`/`DEFAULT_RATES`/`RoomCategory` (`@/lib/constants/rooms`).
- Produces:
  - `interface MaintenanceLike { roomName: string; dateFrom: string; dateTo: string }`
  - `interface TypeAvailability { category: RoomCategory; total: number; free: number; onHold: number; confirmed: number; rate: number }`
  - `function computeAvailability(bookings: Booking[], maintenance: MaintenanceLike[], checkIn: string, checkOut: string): TypeAvailability[]` — one entry per type, in inventory order; invariant `free + onHold + confirmed === total`.

- [ ] **Step 1: Write the failing sanity check**

Create `.superpowers/sdd/availability-check.mjs` (plain JS — tsx transpiles without type-checking, so no casts/type imports are needed; the relative import resolves the `@/` aliases inside `availability.ts`):

```js
import assert from 'node:assert';
import { computeAvailability } from '../../src/lib/utils/availability.ts';

const bookings = [
  { status: 'confirmed', arrival: '2026-07-09', departure: '2026-07-11', rooms: ['Kesar Khema Room 1'] }, // overlaps -> KK1 confirmed
  { status: 'hold',      arrival: '2026-07-11', departure: '2026-07-13', rooms: ['Kesar Khema Room 2'] }, // overlaps -> KK2 held
  { status: 'confirmed', arrival: '2026-07-12', departure: '2026-07-14', rooms: ['Kesar Khema Room 3'] }, // checkout day -> NO overlap -> free
  { status: 'cancelled', arrival: '2026-07-09', departure: '2026-07-13', rooms: ['Kesar Khema Room 4'] }, // cancelled -> ignored -> free
];
const maintenance = [{ roomName: 'Orchard Cottage 1', dateFrom: '2026-07-09', dateTo: '2026-07-11' }]; // overlaps -> OC1 confirmed

const rows = computeAvailability(bookings, maintenance, '2026-07-10', '2026-07-12');
const kk = rows.find(r => r.category === 'Kesar Khema');
const oc = rows.find(r => r.category === 'Orchard Cottage');
const poc = rows.find(r => r.category === 'Premium Orchard Cottage');

assert.deepStrictEqual([kk.total, kk.confirmed, kk.onHold, kk.free], [16, 1, 1, 14], 'Kesar Khema');
assert.deepStrictEqual([oc.total, oc.confirmed, oc.onHold, oc.free], [29, 1, 0, 28], 'Orchard Cottage (maintenance)');
assert.strictEqual(poc.free, 7, 'Premium Orchard all free');
assert.strictEqual(kk.rate, 9000, 'rate from DEFAULT_RATES');
for (const r of rows) assert.strictEqual(r.free + r.onHold + r.confirmed, r.total, `invariant ${r.category}`);
console.log('✅ availability sanity check passed');
```

- [ ] **Step 2: Run it to verify it fails**

Run (from the project root): `node --import tsx .superpowers/sdd/availability-check.mjs`
Expected: FAIL — cannot resolve `../../src/lib/utils/availability.ts` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/utils/availability.ts`:

```ts
import type { Booking } from '@/lib/types/booking';
import { ROOM_INVENTORY, DEFAULT_RATES, type RoomCategory } from '@/lib/constants/rooms';

export interface MaintenanceLike {
  roomName: string;
  dateFrom: string;
  dateTo: string;
}

export interface TypeAvailability {
  category: RoomCategory;
  total: number;
  free: number;
  onHold: number;
  confirmed: number;
  rate: number;
}

const CATEGORIES: RoomCategory[] = ['Kesar Khema', 'Orchard Cottage', 'Premium Orchard Cottage', 'Kothi'];

// Per-room-type availability for the stay [checkIn, checkOut). A unit is "free" only
// if no overlapping booking/maintenance ties it up for any night of the range.
export function computeAvailability(
  bookings: Booking[],
  maintenance: MaintenanceLike[],
  checkIn: string,
  checkOut: string,
): TypeAvailability[] {
  // Half-open overlap (checkout/dateTo day frees the room). Same rule as checkRoomConflict.
  const overlaps = (start: string, end: string) => start < checkOut && end > checkIn;

  const confirmedUnits = new Set<string>();
  const heldUnits = new Set<string>();

  // Invalid range → nothing tied up (caller's modal also guards this).
  if (checkIn < checkOut) {
    for (const bk of bookings) {
      if (bk.status === 'cancelled') continue;
      if (!overlaps(bk.arrival, bk.departure)) continue;
      const isConfirmed = bk.status === 'confirmed' || bk.status === 'checked_in' || bk.status === 'checked_out';
      for (const room of bk.rooms ?? []) {
        if (isConfirmed) confirmedUnits.add(room);
        else if (bk.status === 'hold') heldUnits.add(room);
      }
    }
    for (const m of maintenance) {
      if (overlaps(m.dateFrom, m.dateTo)) confirmedUnits.add(m.roomName);
    }
  }

  return CATEGORIES.map((category) => {
    const units = ROOM_INVENTORY[category];
    let free = 0, onHold = 0, confirmed = 0;
    for (const unit of units) {
      if (confirmedUnits.has(unit)) confirmed++;        // confirmed/maintenance wins over hold
      else if (heldUnits.has(unit)) onHold++;
      else free++;
    }
    return { category, total: units.length, free, onHold, confirmed, rate: DEFAULT_RATES[category] };
  });
}
```

- [ ] **Step 4: Run the sanity check to verify it passes**

Run (from the project root): `node --import tsx .superpowers/sdd/availability-check.mjs`
Expected: prints `✅ availability sanity check passed`.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 6: Commit (engine only — not the throwaway script)**

```bash
git add src/lib/utils/availability.ts
git commit -m "feat(availability): pure per-room-type availability engine"
```

---

### Task 2: RoomAvailabilityModal component

**Files:**
- Create: `src/components/calendar/RoomAvailabilityModal.tsx`

**Interfaces:**
- Consumes: `computeAvailability`, `TypeAvailability`, `MaintenanceLike` (`@/lib/utils/availability`); `Booking` (`@/lib/types/booking`).
- Produces: `export function RoomAvailabilityModal(props: { bookings: Booking[]; maintenanceBlocks: MaintenanceLike[]; onClose: () => void }): JSX.Element`

- [ ] **Step 1: Write the component**

Create `src/components/calendar/RoomAvailabilityModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { X, Search } from 'lucide-react';
import type { Booking } from '@/lib/types/booking';
import { computeAvailability, type MaintenanceLike } from '@/lib/utils/availability';

interface Props {
  bookings: Booking[];
  maintenanceBlocks: MaintenanceLike[];
  onClose: () => void;
}

// Local YYYY-MM-DD (avoids UTC off-by-one in +UTC zones — matches CalendarClient).
function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.round(ms / 86400000);
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function RoomAvailabilityModal({ bookings, maintenanceBlocks, onClose }: Props) {
  // Lazy initializers — Date is impure; keep it out of render (React Compiler).
  const [checkIn, setCheckIn] = useState(() => localDate(0));
  const [checkOut, setCheckOut] = useState(() => localDate(1));

  const valid = checkIn < checkOut;
  const rows = valid ? computeAvailability(bookings, maintenanceBlocks, checkIn, checkOut) : [];
  const nights = valid ? nightsBetween(checkIn, checkOut) : 0;
  const totalFree = rows.reduce((s, r) => s + r.free, 0);

  const freeColor = (free: number) =>
    free === 0 ? 'text-red-600' : free <= 2 ? 'text-amber-600' : 'text-emerald-700';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 bg-emerald-900 text-amber-50">
          <h2 className="flex items-center gap-2 text-lg" style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
            <Search size={16} /> Room Availability
          </h2>
          <button onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-end gap-3">
            <label className="flex-1 text-xs text-stone-600">Check-in
              <input type="date" value={checkIn} max={checkOut} onChange={(e) => setCheckIn(e.target.value)}
                className="mt-1 w-full border border-stone-300 px-2 py-1.5 text-sm outline-none focus:border-emerald-700" />
            </label>
            <label className="flex-1 text-xs text-stone-600">Check-out
              <input type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)}
                className="mt-1 w-full border border-stone-300 px-2 py-1.5 text-sm outline-none focus:border-emerald-700" />
            </label>
            <div className="text-xs text-stone-500 pb-2 whitespace-nowrap">{valid ? `${nights} night${nights === 1 ? '' : 's'}` : ''}</div>
          </div>

          {!valid ? (
            <p className="text-sm text-red-600">Check-out must be after check-in.</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.category} className="border-b border-stone-100">
                      <td className="py-2 font-medium text-stone-800">{r.category}</td>
                      <td className="py-2 text-right tabular-nums">
                        <span className={`font-semibold ${freeColor(r.free)}`}>{r.free} free</span>
                        {r.onHold > 0 && <span className="text-amber-600"> ({r.onHold} on hold)</span>}
                        <span className="text-stone-400"> /{r.total}</span>
                      </td>
                      <td className="py-2 pl-4 text-right text-stone-500 whitespace-nowrap">{inr(r.rate)}/night</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between text-sm pt-1">
                <span className="text-stone-500">Total rooms free</span>
                <span className={`font-semibold ${freeColor(totalFree)}`}>{totalFree} / 54</span>
              </div>
              <p className="text-xs text-stone-400 italic">Counts reflect rooms assigned for the selected dates.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: `✓ Compiled successfully` (no type errors; `lucide-react` `X`/`Search` already used elsewhere).

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/RoomAvailabilityModal.tsx
git commit -m "feat(availability): RoomAvailabilityModal dialog"
```

---

### Task 3: Wire the "Check Availability" button into the Calendar (Sales/Admin only)

**Files:**
- Modify: `src/app/(app)/calendar/CalendarClient.tsx`

**Interfaces:**
- Consumes: `RoomAvailabilityModal` (Task 2); `useCurrentUser` (`@/context/UserContext`).

- [ ] **Step 1: Add imports**

In `src/app/(app)/calendar/CalendarClient.tsx`, after the existing import block (the line `import { LegendPanel } from '@/components/calendar/LegendPanel';`), add:

```tsx
import dynamic from 'next/dynamic';
import { Search } from 'lucide-react';
import { useCurrentUser } from '@/context/UserContext';

const RoomAvailabilityModal = dynamic(
  () => import('@/components/calendar/RoomAvailabilityModal').then((m) => ({ default: m.RoomAvailabilityModal })),
  { ssr: false },
);
```

- [ ] **Step 2: Add role gate + modal state**

Inside `CalendarClient`, immediately after the line `const [tooltip, setTooltip] = useState<{ data: TooltipData; x: number; y: number } | null>(null);` (the existing state block), add:

```tsx
  const currentUser = useCurrentUser();
  const canCheckAvailability =
    currentUser?.role === 'Sales' || currentUser?.role === 'Sales Admin' || currentUser?.role === 'Admin';
  const [showAvailability, setShowAvailability] = useState(false);
```

- [ ] **Step 3: Add the toolbar button + render the modal**

In the `return (...)` JSX, replace this exact block:

```tsx
      <OccupancyHeader
        monthLabel={monthLabel}
        onPrev={() => setMonthOffset((m) => m - 1)}
        onNext={() => setMonthOffset((m) => m + 1)}
        onToday={() => setMonthOffset(0)}
      />

      <OccupancyKPIs kpis={kpis} />
```

with:

```tsx
      <OccupancyHeader
        monthLabel={monthLabel}
        onPrev={() => setMonthOffset((m) => m - 1)}
        onNext={() => setMonthOffset((m) => m + 1)}
        onToday={() => setMonthOffset(0)}
      />

      {canCheckAvailability && (
        <div className="px-4 pt-3">
          <button
            onClick={() => setShowAvailability(true)}
            className="inline-flex items-center gap-2 bg-emerald-800 text-amber-50 text-sm px-4 py-2 hover:bg-emerald-700 transition tracking-wide"
          >
            <Search size={14} /> Check Availability
          </button>
        </div>
      )}

      <OccupancyKPIs kpis={kpis} />

      {showAvailability && (
        <RoomAvailabilityModal
          bookings={bookings}
          maintenanceBlocks={maintenanceBlocks}
          onClose={() => setShowAvailability(false)}
        />
      )}
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: `✓ Compiled successfully`. (`maintenanceBlocks` is `MaintenanceBlock[]` from `./page`, structurally compatible with `MaintenanceLike` — `{ roomName, dateFrom, dateTo }` — so it passes without a cast.)

- [ ] **Step 5: Manual verification**

Run `npm run dev`, open `/calendar` as a Sales or Admin user:
- The "Check Availability" button appears above the KPIs; clicking it opens the dialog defaulted to today→tomorrow (1 night).
- Changing dates updates the per-type counts live; the free/on-hold/total + rate per type match the grid for a date range with known bookings/holds.
- A range with a checkout-day-only overlap shows that room as free.
- Entering check-out ≤ check-in shows "Check-out must be after check-in." and no rows.
- Log in as a Front Office (non-Sales/Admin) user → the button is not rendered on `/calendar`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/calendar/CalendarClient.tsx"
git commit -m "feat(availability): Check Availability button on the Calendar (Sales/Admin)"
```

---

## Self-Review

- **Spec coverage:** client-side approach (Task 1+2+3, no server action ✓); per-type free/on-hold/total + rate (Task 1 fields, Task 2 render ✓); maintenance = unavailable & half-open overlap (Task 1 ✓); "on hold" = status hold regardless of payment (Task 1 ✓); assigned-units basis + footnote (Task 1 reads `rooms[]`; Task 2 footnote ✓); Calendar-toolbar trigger, Sales/Admin only (Task 3 ✓); defaults today→tomorrow, live recompute, checkout>checkin validation (Task 2 ✓); out-of-scope items (no specific-room list, no booking creation, no server fetch) all honored.
- **Placeholder scan:** none — every step has full code/commands.
- **Type consistency:** `computeAvailability(bookings, maintenance, checkIn, checkOut)` and `TypeAvailability { category,total,free,onHold,confirmed,rate }` and `MaintenanceLike { roomName,dateFrom,dateTo }` are used identically in Tasks 1→2→3. `RoomAvailabilityModal` prop shape matches between Task 2 (definition) and Task 3 (usage). `currentUser?.role` strings match `UserRole` values.
