-- ============================================================
-- 006 — Fix bookings.status CHECK constraint
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- The original `bookings_status_check` constraint did not include 'checked_in'
-- (and 'checked_out'), so checking a guest in failed with:
--   23514 — new row for relation "bookings" violates check constraint
--           "bookings_status_check"
--
-- This redefines the constraint to allow the full BookingStatus set used by the
-- app (src/lib/types/booking.ts):
--   confirmed | hold | checked_in | checked_out | cancelled
-- It is a superset of the previous allowed values, so existing rows remain valid.
-- ============================================================

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('confirmed', 'hold', 'checked_in', 'checked_out', 'cancelled'));

-- ── Verify (optional) ──
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'bookings'::regclass AND conname = 'bookings_status_check';
