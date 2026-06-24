-- ============================================================
-- 014 — Voucher tracking. "Voucher Sent" drives Booking Confirmed.
-- Hand-apply in the Supabase SQL editor. Safe to re-run. Defaults to not-sent.
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS voucher_sent boolean NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS voucher_sent_at timestamptz;
