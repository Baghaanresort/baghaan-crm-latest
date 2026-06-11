-- ============================================================================
-- BAGHAAN CRM — FULL SCHEMA BOOTSTRAP (paste-once)
-- ============================================================================
-- Run this ENTIRE file once in the Supabase SQL Editor of a BRAND-NEW project
-- to build the complete schema from scratch. It is the concatenation of:
--   000_base_schema.sql + 001..006 + performance_indexes.sql
-- in the correct order, with CREATE INDEX CONCURRENTLY downgraded to plain
-- CREATE INDEX (the DB is empty, so there is nothing to lock — and CONCURRENTLY
-- cannot run inside the SQL editor's transaction).
--
-- Everything is idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS), so re-running
-- is safe. For incremental changes on an existing DB, use the numbered files
-- individually instead of this bootstrap.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 000 — BASE SCHEMA                                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 1. PROFILES  (one row per auth user; id = auth.users.id)
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
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (true);

-- 2. META  (key/value counters)
CREATE TABLE IF NOT EXISTS meta (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);
ALTER TABLE meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meta_all" ON meta;
CREATE POLICY "meta_all" ON meta
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. ENQUIRIES
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

-- 4. BOOKINGS  (status CHECK already in final 006 form)
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

-- 5. PAYMENTS
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


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 001 — CRM ENHANCEMENTS                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Guest profiles
CREATE TABLE IF NOT EXISTS guests (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name            text NOT NULL DEFAULT '',
  phone           text NOT NULL,
  email           text NOT NULL DEFAULT '',
  company_name    text NOT NULL DEFAULT '',
  gst_number      text NOT NULL DEFAULT '',
  preferences     text NOT NULL DEFAULT '',
  internal_notes  text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS guests_phone_idx ON guests (phone) WHERE phone != '';
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "guests_all" ON guests;
CREATE POLICY "guests_all" ON guests FOR ALL TO authenticated USING (true);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_id text REFERENCES guests(id);

-- Enquiry activity log
CREATE TABLE IF NOT EXISTS enquiry_activities (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  enquiry_id  text NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('call','whatsapp','email','note','status_change','booking_created')),
  note        text NOT NULL DEFAULT '',
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enquiry_activities_enquiry_id_idx ON enquiry_activities (enquiry_id);
ALTER TABLE enquiry_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activities_all" ON enquiry_activities;
CREATE POLICY "activities_all" ON enquiry_activities FOR ALL TO authenticated USING (true);

-- Lost reason + linked booking on enquiries
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS lost_reason text DEFAULT '';
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS lost_at timestamptz;

-- Booking change history (audit log)
CREATE TABLE IF NOT EXISTS booking_history (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  booking_id   text NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  changed_by   text NOT NULL,
  changed_at   timestamptz NOT NULL DEFAULT now(),
  changes      jsonb NOT NULL,
  snapshot     jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS booking_history_booking_id_idx ON booking_history (booking_id);
ALTER TABLE booking_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "history_all" ON booking_history;
CREATE POLICY "history_all" ON booking_history FOR ALL TO authenticated USING (true);

-- Maintenance blocks
CREATE TABLE IF NOT EXISTS maintenance_blocks (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_name   text NOT NULL,
  date_from   date NOT NULL,
  date_to     date NOT NULL,
  reason      text NOT NULL DEFAULT '',
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE maintenance_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "maintenance_all" ON maintenance_blocks;
CREATE POLICY "maintenance_all" ON maintenance_blocks FOR ALL TO authenticated USING (true);

-- In-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  link        text NOT NULL DEFAULT '',
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id, read, created_at DESC);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_own" ON notifications;
CREATE POLICY "notifications_own" ON notifications FOR ALL TO authenticated USING (auth.uid() = user_id);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 002 — Lock enquiry deletes                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "enquiries_no_delete" ON enquiries;
CREATE POLICY "enquiries_no_delete" ON enquiries
  AS RESTRICTIVE FOR DELETE TO public USING (false);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 003 — Voucher edit audit                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
ALTER TABLE booking_history ADD COLUMN IF NOT EXISTS changed_by_id text;
ALTER TABLE booking_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "booking_history_no_update" ON booking_history;
CREATE POLICY "booking_history_no_update" ON booking_history
  AS RESTRICTIVE FOR UPDATE TO public USING (false);
DROP POLICY IF EXISTS "booking_history_no_delete" ON booking_history;
CREATE POLICY "booking_history_no_delete" ON booking_history
  AS RESTRICTIVE FOR DELETE TO public USING (false);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 004 — Corporate menu                                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS menu_items (
  id          text PRIMARY KEY,
  category    text NOT NULL,
  name        text NOT NULL,
  price       numeric,
  veg_type    text NOT NULL DEFAULT 'none',
  description text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "menu_items_rw" ON menu_items;
CREATE POLICY "menu_items_rw" ON menu_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "menu_items_no_delete" ON menu_items;
CREATE POLICY "menu_items_no_delete" ON menu_items
  AS RESTRICTIVE FOR DELETE TO public USING (false);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 005 — Corporate activity log                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS corporate_activity (
  id         text PRIMARY KEY,
  booking_id text NOT NULL,
  type       text NOT NULL,
  message    text NOT NULL DEFAULT '',
  actor      text NOT NULL DEFAULT '',
  actor_id   text,
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


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 006 — Fix bookings.status CHECK (no-op here; already final in 000 above)   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('confirmed','hold','checked_in','checked_out','cancelled'));


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PERFORMANCE INDEXES  (CONCURRENTLY stripped — empty DB, txn-safe)          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Bookings
CREATE INDEX IF NOT EXISTS idx_bookings_created_at_desc ON bookings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_arrival ON bookings (arrival);
CREATE INDEX IF NOT EXISTS idx_bookings_departure ON bookings (departure);
CREATE INDEX IF NOT EXISTS idx_bookings_arrival_departure ON bookings (arrival, departure);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_type ON bookings (booking_type);
CREATE INDEX IF NOT EXISTS idx_bookings_corporate_stage ON bookings (corporate_stage) WHERE corporate_stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_type_stage_arrival ON bookings (booking_type, corporate_stage, arrival DESC) WHERE booking_type = 'corporate';
CREATE INDEX IF NOT EXISTS idx_bookings_created_by ON bookings (created_by);
CREATE INDEX IF NOT EXISTS idx_bookings_guest_id ON bookings (guest_id) WHERE guest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_source_enquiry_id ON bookings (source_enquiry_id) WHERE source_enquiry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_final_bill_btc ON bookings ((final_bill->>'isBTC')) WHERE final_bill IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_departure_text_pattern ON bookings (departure text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_bookings_active ON bookings (arrival, departure, status) WHERE status != 'cancelled';

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id_recorded_at ON payments (booking_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_recorded_at_desc ON payments (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_unverified ON payments (recorded_at DESC) WHERE verified = false;
CREATE INDEX IF NOT EXISTS idx_payments_payment_date_text_pattern ON payments (payment_date text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_payments_date_verified_type ON payments (payment_date, verified, type);
CREATE INDEX IF NOT EXISTS idx_payments_role_verified_date ON payments (recorded_by_role, verified, payment_date) WHERE verified = true;
CREATE INDEX IF NOT EXISTS idx_payments_verified_date ON payments (verified, payment_date);

-- Enquiries
CREATE INDEX IF NOT EXISTS idx_enquiries_created_at_desc ON enquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries (status);
CREATE INDEX IF NOT EXISTS idx_enquiries_followup_status ON enquiries (followup_date, status) WHERE status IN ('new','in_progress') AND followup_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_created_by ON enquiries (created_by);
CREATE INDEX IF NOT EXISTS idx_enquiries_source ON enquiries (source);
CREATE INDEX IF NOT EXISTS idx_enquiries_linked_booking_id ON enquiries (linked_booking_id) WHERE linked_booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enquiries_lost_at ON enquiries (lost_at DESC) WHERE lost_at IS NOT NULL;

-- Activity / history
CREATE INDEX IF NOT EXISTS idx_enquiry_activities_enquiry_id_created_at ON enquiry_activities (enquiry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_history_booking_id_changed_at ON booking_history (booking_id, changed_at DESC);

-- Guests
CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_phone_unique ON guests (phone) WHERE phone != '';
CREATE INDEX IF NOT EXISTS idx_guests_created_at_desc ON guests (created_at DESC);

-- Maintenance blocks
CREATE INDEX IF NOT EXISTS idx_maintenance_blocks_dates ON maintenance_blocks (date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_maintenance_blocks_room_dates ON maintenance_blocks (room_name, date_from, date_to);

-- Profiles / meta
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles (role);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_key_unique ON meta (key);

-- Trigram text search
CREATE INDEX IF NOT EXISTS idx_bookings_guest_name_trgm ON bookings USING gin (guest_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_bookings_confirmation_number_trgm ON bookings USING gin (confirmation_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_bookings_contact_number_trgm ON bookings USING gin (contact_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_enquiries_name_trgm ON enquiries USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_enquiries_phone_trgm ON enquiries USING gin (phone gin_trgm_ops);

-- Stats
ANALYZE bookings;
ANALYZE payments;
ANALYZE enquiries;
ANALYZE enquiry_activities;
ANALYZE booking_history;
ANALYZE guests;
ANALYZE profiles;
ANALYZE meta;

-- ============================================================================
-- Done. Verify:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- Expect 12 tables: booking_history, bookings, corporate_activity, enquiries,
--   enquiry_activities, guests, maintenance_blocks, menu_items, meta,
--   notifications, payments, profiles.
-- ============================================================================
