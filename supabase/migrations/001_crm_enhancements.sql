-- ============================================================
-- Baghaan CRM Enhancements — Run in Supabase SQL Editor
-- Run each block in order. Safe to re-run (uses IF NOT EXISTS).
-- ============================================================

-- 1. Guest Profiles (repeat guest detection)
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

-- 2. Enquiry Activity Log
CREATE TABLE IF NOT EXISTS enquiry_activities (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  enquiry_id  text NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('call', 'whatsapp', 'email', 'note', 'status_change', 'booking_created')),
  note        text NOT NULL DEFAULT '',
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enquiry_activities_enquiry_id_idx ON enquiry_activities (enquiry_id);
ALTER TABLE enquiry_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activities_all" ON enquiry_activities;
CREATE POLICY "activities_all" ON enquiry_activities FOR ALL TO authenticated USING (true);

-- 3. Lost Reason + Linked Booking on Enquiries
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS lost_reason text DEFAULT '';
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS lost_at timestamptz;

-- 4. Booking Change History (Audit Log)
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

-- 5. Maintenance Blocks (room out-of-service)
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

-- 6. In-App Notifications
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

-- ============================================================
-- Run this once to verify all tables exist:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
-- ============================================================
