-- 008 — Cancellation / Postponement approval suite + Front-Office check-in support
--
-- Adds:
--   1. 'Sales Admin' role (the approver tier).
--   2. 'refund' payment type + refund_status (refunds reuse the payments ledger).
--   3. booking_requests table (cancellation + postponement request/approval spine).
--   4. cancellation reason fields on bookings.
--
-- Front-office check-in needs NO change: bookings_status_check already allows
-- 'checked_in'/'checked_out' (migration 006).
--
-- Hand-apply in the Supabase SQL editor, like the other numbered migrations.

-- 1. New role -----------------------------------------------------------------
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'Sales', 'Sales Admin', 'Front Office', 'Accounts', 'Admin',
    'Central Store', 'Purchase', 'Kitchen', 'F&B',
    'Housekeeping', 'Maintenance', 'Horticulture'
  ));

-- 2. Refunds as payments ------------------------------------------------------
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_type_check;
ALTER TABLE payments ADD CONSTRAINT payments_type_check
  CHECK (type IN ('advance', 'balance', 'btc_receipt', 'refund'));

ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_status text
  CHECK (refund_status IN ('pending', 'done'));

-- 3. Booking requests (cancellation + postponement) ---------------------------
CREATE TABLE IF NOT EXISTS booking_requests (
  id            text PRIMARY KEY,
  booking_id    text NOT NULL REFERENCES bookings(id),
  type          text NOT NULL CHECK (type IN ('cancellation', 'postponement')),
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  reason        text DEFAULT '',
  payload       jsonb,                 -- postponement: { arrival, departure, nights }
  requested_by  text NOT NULL,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_by    text,
  decided_at    timestamptz,
  completed_by  text,
  completed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_booking_requests_booking ON booking_requests(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_status  ON booking_requests(status);

ALTER TABLE booking_requests ENABLE ROW LEVEL SECURITY;
-- Authorization is re-checked server-side in the actions, matching the rest of the app.
DROP POLICY IF EXISTS booking_requests_all ON booking_requests;
CREATE POLICY booking_requests_all ON booking_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Cancellation reason on bookings ------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
