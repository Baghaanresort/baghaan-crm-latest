-- ============================================================
-- 000 — BASE SCHEMA (run FIRST, before 001_crm_enhancements.sql)
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).
--
-- Migrations 001–006 only *enhance* an existing schema — they reference
-- profiles / enquiries / bookings / payments / meta but never create them.
-- On the original Supabase project those base tables were created via the
-- dashboard. This script reconstructs them from the app's mappers/types so a
-- fresh project can be stood up from scratch.
--
-- Run order for a brand-new instance:
--   000_base_schema.sql   ← this file
--   001_crm_enhancements.sql
--   002_lock_enquiry_delete.sql
--   003_voucher_audit.sql
--   004_menu_items.sql
--   005_corporate_activity.sql
--   006_fix_bookings_status_check.sql
--   performance_indexes.sql   ← run last; CONCURRENTLY needs no txn (see note)
--
-- Column types mirror how the app reads/writes them:
--   • Date-only fields the app stores as 'YYYY-MM-DD' strings and compares
--     lexicographically (arrival, departure, payment_date, enquiry date,
--     followup_date) are TEXT — performance_indexes uses text_pattern_ops on
--     some of these, which requires a text column.
--   • Instants (created_at, recorded_at, …) are timestamptz (Supabase returns
--     them as ISO strings, which the mappers expect).
--   • Embedded corporate JSON (final_bill, cost_sheet, …) is jsonb.
--
-- RLS: the app uses the cookie-bound client (server.ts) for queries AND
-- actions, so it is subject to RLS. Each base table gets a permissive
-- "FOR ALL TO authenticated" policy — matching the pattern the 001 migration
-- uses for the enhancement tables. Authorization is additionally re-checked
-- server-side in every Server Action. The service-role client (admin.ts)
-- bypasses RLS entirely.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILES  (one row per auth user; id = auth.users.id)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT '',
  role        text NOT NULL DEFAULT 'Sales'
                CHECK (role IN (
                  'Sales','Front Office','Accounts','Admin',
                  'Central Store','Purchase','Kitchen','F&B',
                  'Housekeeping','Maintenance','Horticulture'
                )),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- Any authenticated user can read profiles (nav, role checks, agent names).
-- Writes happen through the service-role client (invite/update/delete users).
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (true);

-- ------------------------------------------------------------
-- 2. META  (key/value counters: booking_counter, enquiry_counter, pi_counter)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);

ALTER TABLE meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meta_all" ON meta;
CREATE POLICY "meta_all" ON meta
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 3. ENQUIRIES
--    (lost_reason / lost_at columns are added later in 001)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enquiries (
  id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  enquiry_number   integer,
  date             text NOT NULL DEFAULT '',
  name             text NOT NULL DEFAULT '',
  phone            text NOT NULL DEFAULT '',
  email            text NOT NULL DEFAULT '',
  source           text NOT NULL DEFAULT '',
  enquiry_type     text NOT NULL DEFAULT '',
  number_of_rooms  text NOT NULL DEFAULT '',
  preferred_dates  text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new','in_progress','booked','lost')),
  next_action      text NOT NULL DEFAULT '',
  followup_date    text,
  notes            text NOT NULL DEFAULT '',
  created_by       text NOT NULL DEFAULT '',
  updated_by       text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  linked_booking_id text
);

ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "enquiries_all" ON enquiries;
CREATE POLICY "enquiries_all" ON enquiries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 4. BOOKINGS
--    (guest_id column is added later in 001; the status CHECK is
--     widened in 006 to include checked_in/checked_out — defined
--     here already in its final form so a fresh DB is correct.)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  confirmation_number text NOT NULL DEFAULT '',
  guest_name          text NOT NULL DEFAULT '',
  contact_number      text NOT NULL DEFAULT '',
  email               text NOT NULL DEFAULT '',
  company_name        text NOT NULL DEFAULT '',
  gst_number          text NOT NULL DEFAULT '',
  arrival             text NOT NULL DEFAULT '',
  departure           text NOT NULL DEFAULT '',
  nights              integer NOT NULL DEFAULT 0,
  adults              integer NOT NULL DEFAULT 0,
  children            integer NOT NULL DEFAULT 0,
  rooms               text[] NOT NULL DEFAULT '{}',
  rate_breakdown      text NOT NULL DEFAULT '',
  total_amount        numeric NOT NULL DEFAULT 0,
  advance_paid        numeric NOT NULL DEFAULT 0,
  inclusions          text NOT NULL DEFAULT '',
  remarks             text NOT NULL DEFAULT '',
  special_requests    text NOT NULL DEFAULT '',
  created_by          text NOT NULL DEFAULT '',
  status              text NOT NULL DEFAULT 'confirmed'
                        CONSTRAINT bookings_status_check
                        CHECK (status IN ('confirmed','hold','checked_in','checked_out','cancelled')),
  hold_expires_at     timestamptz,
  final_bill          jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  booking_type        text NOT NULL DEFAULT 'regular'
                        CHECK (booking_type IN ('regular','corporate')),
  corporate_stage     text,
  company_address     text NOT NULL DEFAULT '',
  company_gst         text NOT NULL DEFAULT '',
  contact_name        text NOT NULL DEFAULT '',
  contact_email       text NOT NULL DEFAULT '',
  guest_count         jsonb,
  cost_sheet          jsonb,
  proforma_invoice    jsonb,
  source_enquiry_id   text
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bookings_all" ON bookings;
CREATE POLICY "bookings_all" ON bookings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 5. PAYMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  booking_id       text NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payment_date     text NOT NULL DEFAULT '',
  amount           numeric NOT NULL DEFAULT 0,
  mode             text NOT NULL DEFAULT '',
  reference        text NOT NULL DEFAULT '',
  type             text NOT NULL DEFAULT 'advance'
                     CHECK (type IN ('advance','balance','btc_receipt')),
  notes            text NOT NULL DEFAULT '',
  verified         boolean NOT NULL DEFAULT false,
  verified_by      text,
  verified_at      timestamptz,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  recorded_by      text NOT NULL DEFAULT '',
  recorded_by_role text NOT NULL DEFAULT ''
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_all" ON payments;
CREATE POLICY "payments_all" ON payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Verify (optional):
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- ============================================================
