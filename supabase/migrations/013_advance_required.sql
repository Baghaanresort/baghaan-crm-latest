-- ============================================================
-- 013 — "Advance to be Paid" target on a hold (the expected deposit to confirm).
-- Hand-apply in the Supabase SQL editor. Safe to re-run. Defaults to 0.
-- Regular holds use this; corporate deals keep using proforma_invoice.advanceRequired.
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS advance_required numeric NOT NULL DEFAULT 0;
