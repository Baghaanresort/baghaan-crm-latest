# Room Availability Check — Design

**Date:** 2026-06-24
**Status:** Approved (design)
**Scope:** A read-only availability checker, launched from the Calendar, that shows
per-room-type availability for a chosen check-in→check-out range. Built for speed so a
Sales agent can answer "do you have a room for these dates?" while on a call.

## Goal & success criteria

A Sales/Admin user opens a dialog from the Calendar, picks check-in and check-out dates,
and immediately sees, for each of the four room types, how many units are free, how many
are provisionally on hold, the total in that type, and the nightly rate — e.g.
`Kesar Khema — 14 free (2 on hold) /16 · ₹9,000/night`.

Success: results appear instantly (no perceptible wait) as the agent changes dates; the
free count never promises a room that is already physically committed for any night of the
stay.

## Approach (chosen: client-side)

Compute availability **in the browser** from data the Calendar already loads.
`CalendarClient` receives `initialBookings` (every non-cancelled and cancelled booking,
including holds — see `getBookingsForCalendar`) and `maintenanceBlocks`. The dialog derives
availability from those in-memory, so there is **no server round-trip** and results update
live as the dates change.

- Rejected **server action** (always-fresh but adds a round-trip on every keystroke/date
  change and a new action+query layer) — freshness gain is marginal because the agent is on
  a freshly-loaded Calendar page.
- "Sales/Admin only" is enforced as a **UI gate** (the button is only rendered for those
  roles). This adds no data exposure: the booking data is already loaded for everyone who can
  view the Calendar; the dialog only re-presents it.

## Inventory (source of truth)

From `src/lib/constants/rooms.ts` — do not duplicate:

| Type | Units | Nightly rate |
|---|---|---|
| Kesar Khema | 16 | ₹9,000 |
| Orchard Cottage | 29 | ₹11,000 |
| Premium Orchard Cottage | 7 | ₹14,000 |
| Kothi | 2 | ₹22,000 |

`ROOM_INVENTORY` gives the specific unit names per type; `DEFAULT_RATES` gives the rate;
`getRoomCategory(roomName)` maps a unit name back to its type.

## Component 1 — Availability engine (`src/lib/utils/availability.ts`, pure)

```
computeAvailability(
  bookings: Booking[],
  maintenanceBlocks: MaintenanceBlock[],
  checkIn: string,   // 'YYYY-MM-DD'
  checkOut: string,  // 'YYYY-MM-DD'
): TypeAvailability[]
```

`TypeAvailability = { category, total, free, onHold, confirmed, rate }`, one per type, in
inventory order.

**Algorithm** — operate on individual room *units*:
1. A booking **overlaps** the range with the same half-open rule as `checkRoomConflict`:
   `status !== 'cancelled' && arrival < checkOut && departure > checkIn`. (Checkout day frees
   the room.)
2. For each overlapping booking, every name in its `rooms[]` array marks that unit as tied
   up, classified by the booking's `status`:
   - `confirmed | checked_in | checked_out` → **confirmed-occupied**
   - `hold` → **held**
3. A **maintenance block** ties up its `roomName` when it overlaps the range (same night-overlap
   interpretation the Calendar grid already uses for maintenance shading — reuse that rule for
   consistency); maintenance counts as **confirmed-occupied** (hard-unavailable).
4. Per type, over its inventory units:
   - `free` = units in no tie-up set
   - `onHold` = units whose only tie-up is hold booking(s) (not confirmed, not maintenance)
   - `confirmed` = units that are confirmed-occupied (incl. maintenance)
   - `total` = inventory count; invariant `free + onHold + confirmed === total`

This is a pure function with no I/O — directly unit-checkable.

**Explicit decisions / edge cases:**
- **Assigned-units basis.** Availability counts *assigned room units*. A booking (often an
  early hold) with an empty `rooms[]` reserves no specific unit and therefore does not reduce
  any type's count. The dialog notes that figures reflect assigned rooms.
- **"On hold" = `status === 'hold'`** regardless of payment (the Calendar dataset has no
  payments, so effective/paid status isn't computed here). A paid hold still shows under "on
  hold". Acceptable for v1.
- **Maintenance = unavailable**, folded into `confirmed` (not shown as a separate column in
  v1; rooms simply aren't free).
- **Whole-range semantics.** A unit is free only if free for the entire stay — guaranteed by
  the single date-overlap test against each booking (any overlapping night ties the unit up).

## Component 2 — Dialog (`RoomAvailabilityModal`, client)

- Two date inputs, prefilled **today → tomorrow** (1 night). Shows the nights count.
  Recomputes live on any change (cheap; ~54 units × few hundred bookings).
- Validation: check-out must be strictly after check-in; otherwise show an inline message and
  no rows.
- One row per type: `name — {free} free ({onHold} on hold) /{total} · ₹{rate}/night`, with a
  color cue on the free count (green > 0 plenty / amber low / red 0). A totals line sums free
  across all types.
- Footnote: "Counts reflect assigned rooms for the selected dates."
- Lives in `src/components/calendar/RoomAvailabilityModal.tsx`, loaded via `next/dynamic`
  (`ssr: false`) like the Calendar's other modals.

## Component 3 — Trigger (Calendar toolbar)

A "🔍 Check Availability" button in the `CalendarClient` toolbar, rendered **only for Sales
and Admin** (role check via the page's current user / `usePermissions`). Opens the modal,
passing the already-loaded `bookings` + `maintenanceBlocks`.

## Out of scope (v1)

- Drill-down to specific free room numbers.
- Creating/holding a booking from the dialog.
- Per-night availability breakdown or alternative-date suggestions.
- A server action / fresh re-query (client-side only).
- Surfacing the checker anywhere other than the Calendar page.

## Testing

No formal suite in this repo; `npm run build` is the typecheck gate. Plan:
- A throwaway node sanity check of `computeAvailability` against a hand-built fixture
  (overlapping confirmed booking, an overlapping hold, a maintenance block, a non-overlapping
  booking) asserting the `free/onHold/confirmed/total` invariant.
- Manual: open the dialog on a date range with known bookings/holds and confirm the counts
  match the Calendar grid; confirm the button is hidden for non-Sales/Admin roles.
