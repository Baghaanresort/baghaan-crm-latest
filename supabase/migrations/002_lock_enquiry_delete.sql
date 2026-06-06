-- ============================================================
-- 002 — Lock enquiry deletes at the DB layer (Task 4)
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Enquiries are a permanent record. The delete UI + server action were removed
-- in the app; this enforces it at the database so no authenticated client can
-- DELETE an enquiry even if a permissive "FOR ALL" policy exists.
--
-- How it works: a RESTRICTIVE policy is AND-combined with all permissive
-- policies. `USING (false)` for DELETE means the row is never visible to a
-- DELETE, so deletes affect 0 rows / are blocked — without touching the
-- existing SELECT / INSERT / UPDATE access.
--
-- Note: the Supabase service-role key (src/lib/supabase/admin.ts) BYPASSES RLS.
-- The app never deletes enquiries with that client, so this is sufficient. A DB
-- owner/superuser can still delete manually for maintenance.
-- ============================================================

ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enquiries_no_delete" ON enquiries;
CREATE POLICY "enquiries_no_delete" ON enquiries
  AS RESTRICTIVE
  FOR DELETE
  TO public
  USING (false);

-- ── Verify (optional) ──
-- List policies on enquiries; you should see enquiries_no_delete as RESTRICTIVE / DELETE:
--   SELECT polname, polcmd, polpermissive FROM pg_policy
--   WHERE polrelid = 'enquiries'::regclass;
-- Then confirm a delete is blocked (should report 0 rows / error, NOT remove data):
--   DELETE FROM enquiries WHERE id = 'some-real-id';  -- run as authenticated, e.g. via the app
