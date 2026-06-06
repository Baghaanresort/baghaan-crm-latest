-- ============================================================
-- 003 — Voucher edit audit (Task 12)
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Voucher edits are recorded in the existing `booking_history` table. The task
-- requires the editor's USER ID (booking_history only had changed_by = name),
-- so add changed_by_id. We also make the audit log append-only (best practice:
-- an audit trail nobody can quietly rewrite) via RESTRICTIVE no-UPDATE/no-DELETE
-- policies — these AND-combine with the existing permissive "history_all"
-- policy, so INSERT + SELECT still work. (Service-role bypasses RLS for any
-- legitimate maintenance.)
-- ============================================================

ALTER TABLE booking_history ADD COLUMN IF NOT EXISTS changed_by_id text;

ALTER TABLE booking_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booking_history_no_update" ON booking_history;
CREATE POLICY "booking_history_no_update" ON booking_history
  AS RESTRICTIVE FOR UPDATE TO public USING (false);

DROP POLICY IF EXISTS "booking_history_no_delete" ON booking_history;
CREATE POLICY "booking_history_no_delete" ON booking_history
  AS RESTRICTIVE FOR DELETE TO public USING (false);

-- ── Verify (optional) ──
--   SELECT polname, polcmd, polpermissive FROM pg_policy
--   WHERE polrelid = 'booking_history'::regclass;
