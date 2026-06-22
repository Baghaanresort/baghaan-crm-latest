-- ============================================================
-- 010 — Booking add-ons (line-item extras captured at booking / hold / corporate time)
-- Hand-apply in the Supabase SQL editor. Safe to re-run.
-- ============================================================

-- add_ons: jsonb array of { name, pricePerUnit, units, total } captured on a booking.
-- Default '[]' so every existing row, and any insert that omits the column, is a
-- valid empty list (lets partial updates leave it untouched).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS add_ons jsonb NOT NULL DEFAULT '[]'::jsonb;
