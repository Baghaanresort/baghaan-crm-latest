-- ============================================================
-- BAGHAAN CRM — PRODUCTION PERFORMANCE INDEXES
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to run multiple times — all use IF NOT EXISTS / CONCURRENTLY
-- ============================================================

-- ============================================================
-- 1. BOOKINGS TABLE
--    Primary access patterns:
--    - Full list: ORDER BY created_at DESC
--    - Dashboard: arrival = today, departure = today, arrival <= today < departure
--    - Calendar: date range collision detection
--    - Corporate pipeline: WHERE booking_type = 'corporate'
--    - Agent filter: WHERE created_by = ?
--    - Guest lookup: WHERE guest_id = ?
--    - BTC receivables: final_bill->>'isBTC' = 'true'
-- ============================================================

-- Default sort (every page load hits this)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_created_at_desc
  ON bookings (created_at DESC);

-- Dashboard: arrivals/departures today + in-house check
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_arrival
  ON bookings (arrival);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_departure
  ON bookings (departure);

-- Calendar grid + room collision detection (most expensive query in the app)
-- Covers: WHERE arrival <= $date AND departure > $date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_arrival_departure
  ON bookings (arrival, departure);

-- Status filter (hold/confirmed/cancelled/checked_in/checked_out)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_status
  ON bookings (status);

-- Corporate pipeline view
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_booking_type
  ON bookings (booking_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_corporate_stage
  ON bookings (corporate_stage)
  WHERE corporate_stage IS NOT NULL;

-- Composite: corporate pipeline sorted by arrival
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_type_stage_arrival
  ON bookings (booking_type, corporate_stage, arrival DESC)
  WHERE booking_type = 'corporate';

-- Agent-based filtering (bookings list + dashboard leaderboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_created_by
  ON bookings (created_by);

-- Guest profile: all bookings for a guest
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_guest_id
  ON bookings (guest_id)
  WHERE guest_id IS NOT NULL;

-- Enquiry conversion: link back
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_source_enquiry_id
  ON bookings (source_enquiry_id)
  WHERE source_enquiry_id IS NOT NULL;

-- BTC receivables panel: WHERE (final_bill->>'isBTC')::boolean = true
-- Used in Dashboard for Accounts/Admin role
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_final_bill_btc
  ON bookings ((final_bill->>'isBTC'))
  WHERE final_bill IS NOT NULL;

-- MTD panel: departures in current month (text date 'YYYY-MM-DD')
-- Covers slice(0,7) === monthStart pattern
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_departure_text_pattern
  ON bookings (departure text_pattern_ops);

-- Partial index: only active (non-cancelled) bookings — most queries ignore cancelled
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_active
  ON bookings (arrival, departure, status)
  WHERE status != 'cancelled';

-- ============================================================
-- 2. PAYMENTS TABLE
--    Primary access patterns:
--    - Full list: ORDER BY recorded_at DESC
--    - Per-booking: WHERE booking_id = ? ORDER BY recorded_at DESC (hot path)
--    - Verification queue: WHERE verified = false
--    - MTD: WHERE payment_date LIKE 'YYYY-MM%' AND verified = true
--    - FO breakdown: WHERE recorded_by_role = 'Front Office' AND verified = true
--    - Advance payments: WHERE type = 'advance' AND verified = true
-- ============================================================

-- Most frequent query: payments for a single booking (every booking row click)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_booking_id
  ON payments (booking_id);

-- Composite: booking payments ordered for display
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_booking_id_recorded_at
  ON payments (booking_id, recorded_at DESC);

-- Default sort
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_recorded_at_desc
  ON payments (recorded_at DESC);

-- Accounts verification queue
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_unverified
  ON payments (recorded_at DESC)
  WHERE verified = false;

-- MTD: verified payments by date (text pattern for LIKE 'YYYY-MM%')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_payment_date_text_pattern
  ON payments (payment_date text_pattern_ops);

-- MTD advance payments specifically
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_date_verified_type
  ON payments (payment_date, verified, type);

-- FO daily collection breakdown (resort_received panel)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_role_verified_date
  ON payments (recorded_by_role, verified, payment_date)
  WHERE verified = true;

-- Export: full table ordered
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_verified_date
  ON payments (verified, payment_date);

-- ============================================================
-- 3. ENQUIRIES TABLE
--    Primary access patterns:
--    - Full list: ORDER BY created_at DESC
--    - Morning panel: WHERE status IN ('new','in_progress') AND followup_date <= today
--    - Overdue panel: WHERE followup_date < today AND status != 'booked'/'lost'
--    - Status filter: WHERE status = ?
--    - Source analytics: GROUP BY source
--    - Agent filter: WHERE created_by = ?
-- ============================================================

-- Default sort
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_created_at_desc
  ON enquiries (created_at DESC);

-- Status filter (most common UI filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_status
  ON enquiries (status);

-- Morning workflow: overdue and due-today follow-ups
-- Covers: WHERE followup_date <= today AND status IN ('new','in_progress')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_followup_status
  ON enquiries (followup_date, status)
  WHERE status IN ('new', 'in_progress') AND followup_date IS NOT NULL;

-- Agent filter + analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_created_by
  ON enquiries (created_by);

-- Source analytics breakdown
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_source
  ON enquiries (source);

-- Enquiry → Booking link
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_linked_booking_id
  ON enquiries (linked_booking_id)
  WHERE linked_booking_id IS NOT NULL;

-- Lost reason analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_lost_at
  ON enquiries (lost_at DESC)
  WHERE lost_at IS NOT NULL;

-- ============================================================
-- 4. ENQUIRY_ACTIVITIES TABLE
--    Only access pattern: WHERE enquiry_id = ? ORDER BY created_at DESC
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiry_activities_enquiry_id_created_at
  ON enquiry_activities (enquiry_id, created_at DESC);

-- ============================================================
-- 5. BOOKING_HISTORY TABLE
--    Only access pattern: WHERE booking_id = ? ORDER BY changed_at DESC
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_history_booking_id_changed_at
  ON booking_history (booking_id, changed_at DESC);

-- ============================================================
-- 6. GUESTS TABLE
--    Primary access patterns:
--    - Phone lookup (hot path — every booking create): WHERE phone = ?
--    - Full list: ORDER BY created_at DESC
--    - Booking join: from bookings.guest_id
-- ============================================================

-- Phone lookup is the single hottest query in the app (fires on every booking)
-- If you have the UNIQUE constraint from migrations, this index already exists.
-- This is a safety fallback:
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_guests_phone_unique
  ON guests (phone)
  WHERE phone != '';

-- Default list sort
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_guests_created_at_desc
  ON guests (created_at DESC);

-- ============================================================
-- 7. MAINTENANCE_BLOCKS TABLE
--    Access pattern: date range overlap check during room booking
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maintenance_blocks_dates
  ON maintenance_blocks (date_from, date_to);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maintenance_blocks_room_dates
  ON maintenance_blocks (room_name, date_from, date_to);

-- ============================================================
-- 8. PROFILES TABLE
--    Tiny table (<100 rows) — primary key covers all eq('id',?)
--    Adding role index for admin queries only
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_role
  ON profiles (role);

-- ============================================================
-- 9. META TABLE
--    Single-row lookups by key — ensure it's properly indexed
-- ============================================================

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_meta_key_unique
  ON meta (key);

-- ============================================================
-- 10. ENABLE pg_trgm FOR FAST TEXT SEARCH
--     Powers guest name / phone / confirmation number search
--     (The app filters in JS today — these make future server-side
--      ILIKE queries 10-100x faster)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Guest name trigram search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_guest_name_trgm
  ON bookings USING gin (guest_name gin_trgm_ops);

-- Confirmation number prefix search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_confirmation_number_trgm
  ON bookings USING gin (confirmation_number gin_trgm_ops);

-- Contact number search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_contact_number_trgm
  ON bookings USING gin (contact_number gin_trgm_ops);

-- Enquiry name + phone search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_name_trgm
  ON enquiries USING gin (name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_enquiries_phone_trgm
  ON enquiries USING gin (phone gin_trgm_ops);

-- ============================================================
-- 11. TABLE STATISTICS — ANALYZE
--     Tells the query planner accurate row counts and distributions.
--     Run after bulk data loads or schema changes.
-- ============================================================

ANALYZE bookings;
ANALYZE payments;
ANALYZE enquiries;
ANALYZE enquiry_activities;
ANALYZE booking_history;
ANALYZE guests;
ANALYZE profiles;
ANALYZE meta;

-- ============================================================
-- 12. VERIFY — LIST ALL INDEXES CREATED
-- ============================================================

SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
