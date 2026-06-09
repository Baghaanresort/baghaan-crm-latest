-- ============================================================
-- 004 — Corporate Menu (standard food / snacks menu)
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- A single standard menu the resort maintains, organised into category sections
-- (Snacks, Starters, Main Course, …). Staff add/edit items in the UI and print a
-- guest-facing menu for corporate clients.
--
-- Business rule: a record, once entered, is NEVER deleted. Items are removed from
-- the printed menu by ARCHIVING (is_active = false), not by deleting the row.
-- Enforced at the DB with a RESTRICTIVE no-DELETE policy (same pattern as
-- enquiries in 002), AND-combined with the permissive read/write policy below.
-- ============================================================

CREATE TABLE IF NOT EXISTS menu_items (
  id          text PRIMARY KEY,
  category    text NOT NULL,
  name        text NOT NULL,
  price       numeric,                       -- nullable: blank = no price shown
  veg_type    text NOT NULL DEFAULT 'none',  -- 'veg' | 'non_veg' | 'none'
  description text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true, -- false = archived (hidden from menu, not deleted)
  created_by  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- Read + insert + update for any authenticated user (authorization is also
-- re-checked server-side in the actions, matching the rest of the app).
DROP POLICY IF EXISTS "menu_items_rw" ON menu_items;
CREATE POLICY "menu_items_rw" ON menu_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Never delete: a RESTRICTIVE DELETE policy AND-combines with the permissive
-- policy above to block all deletes while leaving select/insert/update intact.
DROP POLICY IF EXISTS "menu_items_no_delete" ON menu_items;
CREATE POLICY "menu_items_no_delete" ON menu_items
  AS RESTRICTIVE FOR DELETE TO public USING (false);

-- ── Verify (optional) ──
--   SELECT polname, polcmd, polpermissive FROM pg_policy
--   WHERE polrelid = 'menu_items'::regclass;
