-- ============================================================
-- 007 — Enquiry pipeline (BLOCK → PAY → VERIFY → BOOK)
-- Run in Supabase SQL Editor. Safe to re-run.
-- ============================================================

-- 1. Widen enquiry status to the 7-state pipeline.
ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS enquiries_status_check;
ALTER TABLE enquiries ADD CONSTRAINT enquiries_status_check
  CHECK (status IN (
    'new','in_progress','rooms_blocked',
    'advance_pending','advance_confirmed','booked','lost'
  ));

-- 2. In-flight hold link (distinct from linked_booking_id, which is the FINAL
--    Booked link used by the "↗ Converted" badge).
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS held_booking_id text;

-- 3. Partial index: find an enquiry's live hold quickly.
CREATE INDEX IF NOT EXISTS idx_bookings_source_enquiry_hold
  ON bookings (source_enquiry_id)
  WHERE status = 'hold' AND source_enquiry_id IS NOT NULL;

-- 4. Voucher dispatch log (SP1 logs intent; SP2 flips status to 'sent').
CREATE TABLE IF NOT EXISTS voucher_dispatches (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  booking_id  text NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  channel     text NOT NULL CHECK (channel IN ('email','whatsapp')),
  status      text NOT NULL DEFAULT 'logged' CHECK (status IN ('logged','sent','failed')),
  destination text NOT NULL DEFAULT '',
  detail      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voucher_dispatches_booking
  ON voucher_dispatches (booking_id, created_at DESC);
ALTER TABLE voucher_dispatches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voucher_dispatches_all" ON voucher_dispatches;
CREATE POLICY "voucher_dispatches_all" ON voucher_dispatches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
