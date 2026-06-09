-- ============================================================
-- 005 — Corporate activity log (Phase 1: pipeline engine)
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Append-only audit of every corporate-booking action (inquiry created, quote
-- sent/accepted, PI generated, payment verified, confirmed, checked-in,
-- completed, admin stage override). Records are NEVER edited or deleted —
-- enforced with RESTRICTIVE no-UPDATE / no-DELETE policies AND-combined with the
-- permissive insert/select policy.
-- ============================================================

CREATE TABLE IF NOT EXISTS corporate_activity (
  id         text PRIMARY KEY,
  booking_id text NOT NULL,
  type       text NOT NULL,           -- machine code, e.g. 'quote_sent', 'confirmed'
  message    text NOT NULL DEFAULT '',-- human-readable line
  actor      text NOT NULL DEFAULT '',-- who did it (name)
  actor_id   text,                    -- auth user id
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS corporate_activity_booking_idx ON corporate_activity (booking_id, created_at DESC);

ALTER TABLE corporate_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "corporate_activity_rw" ON corporate_activity;
CREATE POLICY "corporate_activity_rw" ON corporate_activity
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "corporate_activity_no_update" ON corporate_activity;
CREATE POLICY "corporate_activity_no_update" ON corporate_activity
  AS RESTRICTIVE FOR UPDATE TO public USING (false);

DROP POLICY IF EXISTS "corporate_activity_no_delete" ON corporate_activity;
CREATE POLICY "corporate_activity_no_delete" ON corporate_activity
  AS RESTRICTIVE FOR DELETE TO public USING (false);
