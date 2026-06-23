-- ============================================================
-- 012 — Itemised room charges on a booking (Room Type · Room Price · No. of Rooms · Total)
-- Hand-apply in the Supabase SQL editor. Safe to re-run.
-- (add_ons already exists from migration 010.)
-- ============================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room_charges jsonb NOT NULL DEFAULT '[]'::jsonb;
