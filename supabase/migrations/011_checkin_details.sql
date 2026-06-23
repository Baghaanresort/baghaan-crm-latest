-- ============================================================
-- 011 — Front-office check-in details captured at the desk.
-- { adults, childBelow6, child6to12, child12to18, roomsAssigned, roomNumbers[] }
-- Hand-apply in the Supabase SQL editor. Safe to re-run. Null until checked in.
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS check_in_details jsonb;
