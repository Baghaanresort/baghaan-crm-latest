-- ============================================================
-- 009 — Transaction engine (Razorpay Payment Links + webhooks)
-- Hand-apply in the Supabase SQL editor. Safe to re-run.
-- Amounts in payment_links are PAISE (integer). payments ledger stays in rupees.
-- ============================================================

-- 1. payment_links: bridge between a booking and a Razorpay link ---------------
CREATE TABLE IF NOT EXISTS payment_links (
  id               text PRIMARY KEY,
  booking_id       text NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  enquiry_id       text REFERENCES enquiries(id),
  purpose          text NOT NULL
                     CHECK (purpose IN ('advance','balance','corporate_advance','final_bill')),
  reference_id     text NOT NULL UNIQUE,
  razorpay_link_id text,
  short_url        text,
  amount           integer NOT NULL,            -- paise
  amount_paid      integer NOT NULL DEFAULT 0,  -- paise
  currency         text NOT NULL DEFAULT 'INR',
  status           text NOT NULL DEFAULT 'created'
                     CHECK (status IN ('created','sent','partially_paid','paid','cancelled','expired')),
  expires_at       timestamptz,
  notes            jsonb,
  created_by       text NOT NULL DEFAULT 'system',
  created_at       timestamptz NOT NULL DEFAULT now(),
  paid_at          timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_links_booking  ON payment_links (booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_rzp       ON payment_links (razorpay_link_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_open      ON payment_links (status)
  WHERE status IN ('created','sent','partially_paid');
ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;
-- Least privilege on a financial table. READ: finance/sales/front-office staff only.
-- INSERT: only the roles that issue links (also re-checked server-side in the actions).
-- There is intentionally NO authenticated UPDATE/DELETE policy — status / amount_paid /
-- paid_at / razorpay_payment_id are mutated ONLY by the Razorpay webhook + reconcile cron,
-- which use the service-role client (bypasses RLS). This stops a logged-in user from
-- forging a 'paid' status or tampering with amounts.
DROP POLICY IF EXISTS payment_links_all    ON payment_links;
DROP POLICY IF EXISTS payment_links_read   ON payment_links;
DROP POLICY IF EXISTS payment_links_insert ON payment_links;
CREATE POLICY payment_links_read ON payment_links
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('Admin','Accounts','Sales','Sales Admin','Front Office')));
CREATE POLICY payment_links_insert ON payment_links
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                      AND p.role IN ('Admin','Sales','Sales Admin','Front Office')));

-- 2. webhook_events: inbound Razorpay events (dedupe + audit + replay) ----------
CREATE TABLE IF NOT EXISTS webhook_events (
  id              text PRIMARY KEY,             -- x-razorpay-event-id
  event_type      text NOT NULL,
  entity_id       text,
  signature_valid boolean NOT NULL,
  processed       boolean NOT NULL DEFAULT false,
  processed_at    timestamptz,
  error           text,
  payload         jsonb NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events (event_type, received_at DESC);
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
-- Admin-only read; all writes happen via the service-role client (bypasses RLS).
DROP POLICY IF EXISTS webhook_events_admin ON webhook_events;
CREATE POLICY webhook_events_admin ON webhook_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'Admin'));

-- 3. outbound_messages: WhatsApp/email send log (replaces voucher_dispatches) ---
CREATE TABLE IF NOT EXISTS outbound_messages (
  id                  text PRIMARY KEY,
  booking_id          text REFERENCES bookings(id) ON DELETE RESTRICT,
  enquiry_id          text REFERENCES enquiries(id),
  channel             text NOT NULL CHECK (channel IN ('whatsapp','email')),
  purpose             text NOT NULL
                        CHECK (purpose IN ('payment_request','voucher','balance_request',
                                           'final_bill_request','payment_receipt','refund_notice')),
  template            text,
  destination         text NOT NULL DEFAULT '',
  provider            text,
  provider_message_id text,
  status              text NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued','sent','delivered','read','failed')),
  error               text,
  payload             jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outbound_booking ON outbound_messages (booking_id, created_at DESC);
ALTER TABLE outbound_messages ENABLE ROW LEVEL SECURITY;
-- Same model as payment_links. READ: staff only. INSERT: the link/voucher-sending roles
-- (re-checked in actions). Delivery-status UPDATEs (sent→delivered→read/failed) and all
-- webhook-side sends go through the service-role client, so NO authenticated UPDATE/DELETE
-- policy — a logged-in user cannot forge or rewrite the send/audit log.
DROP POLICY IF EXISTS outbound_messages_all    ON outbound_messages;
DROP POLICY IF EXISTS outbound_messages_read   ON outbound_messages;
DROP POLICY IF EXISTS outbound_messages_insert ON outbound_messages;
CREATE POLICY outbound_messages_read ON outbound_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                 AND p.role IN ('Admin','Accounts','Sales','Sales Admin','Front Office')));
CREATE POLICY outbound_messages_insert ON outbound_messages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
                      AND p.role IN ('Admin','Sales','Sales Admin','Front Office')));

-- 4. payments: Razorpay linkage + idempotency ---------------------------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS razorpay_payment_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS razorpay_link_id    text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS razorpay_refund_id  text;
-- A given Razorpay payment can only ever produce ONE ledger row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_rzp_payment
  ON payments (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;

-- 5. default advance percentage (overridable) ---------------------------------
INSERT INTO meta (key, value) VALUES ('advance_default_pct', '50')
  ON CONFLICT (key) DO NOTHING;
