# Transaction Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate Baghaan's money flow — Razorpay Payment Links for advance/balance/corporate/refunds, sent over WhatsApp + email, reconciled by a signed webhook, so payments are recorded and verified automatically while a human keeps the final "Confirm booking" click.

**Architecture:** A server-only `transactionEngine` orchestrator sits behind the existing Server Actions, with thin adapters (`razorpay`, `whatsapp`, `email`, `messaging`). Razorpay's webhook (`/api/webhooks/razorpay`) is the source of truth for money and writes via the service-role admin client; a Vercel Cron reconcile job is the safety net. Engine functions take a Supabase client as their first argument (mirroring `corporateEngine.ts`) so the same code serves both cookie-bound actions and the admin-client webhook.

**Tech Stack:** Next.js 16 App Router · React 19 · Supabase (Postgres + RLS) · TypeScript strict · Razorpay Payment Links + Refunds REST API (plain `fetch`, no SDK) · WhatsApp via BSP (Twilio/Gupshup, `fetch`) · Resend email (`fetch`) · Node `crypto` for HMAC.

**Spec:** `docs/superpowers/specs/2026-06-19-transaction-engine-design.md`

## Global Constraints

- **Next.js 16 + React 19** — read `node_modules/next/dist/docs/` before using framework APIs; React Compiler is on (no manual `useMemo`/`useCallback`).
- **TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`** — indexed access is `T | undefined`; never assign `undefined` to an optional prop (omit it).
- **`ActionResult<T>`** — every Server Action returns `ok(data)` / `err(message)`; never throw across the action boundary; clients branch on `.success`.
- **Mapper boundary** — all DB ↔ app crossings go through a mapper (`snake_case` ↔ `camelCase`); clients never see raw rows.
- **Auth re-checked in every action** via the local `getAuthedUser` helper; permission checks are server-side, not UI-derived.
- **Supabase clients:** `src/lib/supabase/server.ts` (cookie, RLS) for actions/queries; `src/lib/supabase/admin.ts` `createAdminClient()` (service role, bypasses RLS) **only** in the webhook + cron route handlers.
- **Money unit:** Razorpay = **paise (integer)**; the `payments` ledger + `bookings.total_amount` = **rupees**. Convert only at the Razorpay boundary via `toPaise`/`fromPaise`. Never store paise in `payments`.
- **No new runtime dependencies** — Razorpay/WhatsApp/Resend are called with `fetch`. The only new dev dependency is `tsx` (test runner loader).
- **Migrations** are hand-applied in the Supabase SQL editor, numbered, idempotent (`IF NOT EXISTS`, `DROP ... IF EXISTS`), RLS = `FOR ALL TO authenticated USING (true) WITH CHECK (true)` (authorization re-checked in actions).
- **Build is the CI gate:** `npm run build` (typecheck) and `npm run lint` must pass at the end of every task. Pure functions also get `npm test`.

## Testing strategy (this repo has no test suite)

The repo's gate is `npm run build`. This plan adds a **minimal** unit-test harness (Task 1) for the **pure, security/money-critical** functions only — `verifyWebhookSignature`, `toPaise`/`fromPaise`, `computeAdvance`, `buildReferenceId`, `parseRazorpayEvent`. Everything else (DB writes, external HTTP, the webhook route) is verified by `npm run build` + `npm run lint` + **manual Razorpay test-mode** flows on a Vercel preview deployment (Razorpay can deliver webhooks to the preview URL; the dashboard's "Send test webhook" button also works).

- Unit tests run via `node --import tsx --test "src/**/*.test.ts"` (requires Node ≥ 22 for `--test` glob support — pinned in Task 1). Tests are co-located as `<name>.test.ts`.

---

## Task 1: Test harness, Node pin, env example, shared constants

**Files:**
- Modify: `package.json` (scripts + devDependency + engines)
- Create: `.nvmrc`
- Create: `.env.example`
- Create: `src/lib/constants/transactions.ts`
- Create: `src/lib/utils/sanity.test.ts` (throwaway, proves the harness)

**Interfaces:**
- Produces: `npm test` runs `*.test.ts`; constants `PAYMENT_LINK_PURPOSES`, `OUTBOUND_PURPOSES`, `ADVANCE_DEFAULT_PCT_KEY`, `RAZORPAY_WEBHOOK_EVENTS`.

- [ ] **Step 1: Add devDep + scripts + Node engine.** Edit `package.json`:

```jsonc
// scripts: add
"test": "node --import tsx --test \"src/**/*.test.ts\"",
// devDependencies: add
"tsx": "^4.19.2",
// add top-level engines
"engines": { "node": ">=22.0.0" }
```

Then create `.nvmrc`:

```
22
```

- [ ] **Step 2: Install.**

Run: `npm install`
Expected: `tsx` added, lockfile updated, no errors.

- [ ] **Step 3: Prove the harness with a sanity test.** Create `src/lib/utils/sanity.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('harness runs typescript tests', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 4: Run it.**

Run: `npm test`
Expected: `pass 1` (and `node --version` ≥ 22; if `--test` glob errors, the Node version is too old — fix before continuing).

- [ ] **Step 5: Delete the sanity test.**

Run: `rm src/lib/utils/sanity.test.ts`

- [ ] **Step 6: Add the env example.** Create `.env.example`:

```bash
# --- existing ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VOUCHER_SECRET=

# --- transaction engine ---
APP_BASE_URL=https://your-app.vercel.app
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# WhatsApp BSP (one provider active at a time)
WHATSAPP_PROVIDER=twilio                 # twilio | gupshup
# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
# Gupshup
GUPSHUP_API_KEY=
GUPSHUP_SOURCE_NUMBER=
GUPSHUP_APP_NAME=
# Approved template names
WHATSAPP_TEMPLATE_PAYMENT_REQUEST=
WHATSAPP_TEMPLATE_VOUCHER=
WHATSAPP_TEMPLATE_RECEIPT=
WHATSAPP_TEMPLATE_REFUND=

# Email
RESEND_API_KEY=
EMAIL_FROM=Baghaan Resort <bookings@baghaan.com>

# Cron auth
CRON_SECRET=
```

- [ ] **Step 7: Shared constants.** Create `src/lib/constants/transactions.ts`:

```ts
export const PAYMENT_LINK_PURPOSES = ['advance', 'balance', 'corporate_advance', 'final_bill'] as const;
export type PaymentLinkPurpose = (typeof PAYMENT_LINK_PURPOSES)[number];

export const PAYMENT_LINK_STATUSES = ['created', 'sent', 'partially_paid', 'paid', 'cancelled', 'expired'] as const;
export type PaymentLinkStatus = (typeof PAYMENT_LINK_STATUSES)[number];

export const OUTBOUND_CHANNELS = ['whatsapp', 'email'] as const;
export type OutboundChannel = (typeof OUTBOUND_CHANNELS)[number];

export const OUTBOUND_PURPOSES = [
  'payment_request', 'voucher', 'balance_request', 'final_bill_request', 'payment_receipt', 'refund_notice',
] as const;
export type OutboundPurpose = (typeof OUTBOUND_PURPOSES)[number];

export const OUTBOUND_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed'] as const;
export type OutboundStatus = (typeof OUTBOUND_STATUSES)[number];

// meta key for the overridable default advance percentage
export const ADVANCE_DEFAULT_PCT_KEY = 'advance_default_pct';
export const ADVANCE_DEFAULT_PCT_FALLBACK = 50;

// Razorpay webhook events we subscribe to
export const RAZORPAY_WEBHOOK_EVENTS = [
  'payment_link.paid', 'payment_link.partially_paid', 'payment_link.cancelled',
  'payment_link.expired', 'refund.processed', 'refund.failed',
] as const;

// Maps a payment-link purpose to the payments-ledger row type it produces.
export function purposeToPaymentType(p: PaymentLinkPurpose): 'advance' | 'balance' {
  return p === 'advance' || p === 'corporate_advance' ? 'advance' : 'balance';
}
```

- [ ] **Step 8: Gate + commit.**

Run: `npm run build && npm run lint`
Expected: both pass.

```bash
git add package.json package-lock.json .nvmrc .env.example src/lib/constants/transactions.ts
git commit -m "chore: add tsx test harness, Node 22 pin, env example, transaction constants"
```

---

## Task 2: Migration 009 — payment_links, webhook_events, outbound_messages, payments columns

**Files:**
- Create: `supabase/migrations/009_transaction_engine.sql`

**Interfaces:**
- Produces: tables `payment_links`, `webhook_events`, `outbound_messages`; `payments.razorpay_payment_id` (unique-when-present), `payments.razorpay_link_id`, `payments.razorpay_refund_id`.

- [ ] **Step 1: Write the migration.** Create `supabase/migrations/009_transaction_engine.sql`:

```sql
-- ============================================================
-- 009 — Transaction engine (Razorpay Payment Links + webhooks)
-- Hand-apply in the Supabase SQL editor. Safe to re-run.
-- Amounts in payment_links are PAISE (integer). payments ledger stays in rupees.
-- ============================================================

-- 1. payment_links: bridge between a booking and a Razorpay link ---------------
CREATE TABLE IF NOT EXISTS payment_links (
  id               text PRIMARY KEY,
  booking_id       text NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
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
DROP POLICY IF EXISTS payment_links_all ON payment_links;
CREATE POLICY payment_links_all ON payment_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

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
  booking_id          text REFERENCES bookings(id) ON DELETE CASCADE,
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
DROP POLICY IF EXISTS outbound_messages_all ON outbound_messages;
CREATE POLICY outbound_messages_all ON outbound_messages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

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
```

- [ ] **Step 2: Apply it.** Paste the file into the Supabase SQL editor and run. Then verify:

Run (Supabase SQL editor):
```sql
SELECT count(*) FROM payment_links;
SELECT count(*) FROM webhook_events;
SELECT count(*) FROM outbound_messages;
SELECT column_name FROM information_schema.columns
 WHERE table_name='payments' AND column_name LIKE 'razorpay%';
```
Expected: three `0` counts and three `razorpay_*` columns.

- [ ] **Step 3: Commit.**

```bash
git add supabase/migrations/009_transaction_engine.sql
git commit -m "feat(db): 009 transaction engine tables (payment_links, webhook_events, outbound_messages)"
```

---

## Task 3: Money conversion utils (paise ↔ rupees)

**Files:**
- Create: `src/lib/utils/money.ts`
- Test: `src/lib/utils/money.test.ts`

**Interfaces:**
- Produces: `toPaise(rupees: number): number`, `fromPaise(paise: number): number`, `formatINR(rupees: number): string`.

- [ ] **Step 1: Write the failing test.** Create `src/lib/utils/money.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPaise, fromPaise, formatINR } from './money';

test('toPaise converts rupees to integer paise', () => {
  assert.equal(toPaise(100), 10000);
  assert.equal(toPaise(1499.5), 149950);
  assert.equal(toPaise(0), 0);
});

test('toPaise rounds float artifacts to the nearest paisa', () => {
  assert.equal(toPaise(19.99), 1999);
  assert.equal(toPaise(0.1 + 0.2), 30); // 0.30000000000000004 -> 30
});

test('fromPaise converts paise back to rupees', () => {
  assert.equal(fromPaise(10000), 100);
  assert.equal(fromPaise(149950), 1499.5);
});

test('toPaise rejects non-finite input', () => {
  assert.throws(() => toPaise(Number.NaN));
  assert.throws(() => toPaise(-5));
});

test('formatINR renders Indian grouping', () => {
  assert.equal(formatINR(150000), '₹1,50,000');
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `npm test`
Expected: FAIL — `Cannot find module './money'`.

- [ ] **Step 3: Implement.** Create `src/lib/utils/money.ts`:

```ts
// Razorpay works in paise (integers). The app ledger works in rupees.
// Convert ONLY at the Razorpay boundary.

export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees) || rupees < 0) {
    throw new Error(`toPaise: invalid rupee amount ${rupees}`);
  }
  return Math.round(rupees * 100);
}

export function fromPaise(paise: number): number {
  if (!Number.isInteger(paise) || paise < 0) {
    throw new Error(`fromPaise: invalid paise amount ${paise}`);
  }
  return paise / 100;
}

export function formatINR(rupees: number): string {
  return `₹${Math.round(rupees).toLocaleString('en-IN')}`;
}
```

- [ ] **Step 4: Run tests, verify pass.**

Run: `npm test`
Expected: PASS (5 tests).

- [ ] **Step 5: Gate + commit.**

Run: `npm run build && npm run lint`
```bash
git add src/lib/utils/money.ts src/lib/utils/money.test.ts
git commit -m "feat: paise/rupee money conversion utils"
```

---

## Task 4: Razorpay adapter — signature verification (TDD) + REST client

**Files:**
- Create: `src/lib/server/razorpay.ts`
- Test: `src/lib/server/razorpay.test.ts`

**Interfaces:**
- Consumes: `toPaise` (Task 3).
- Produces:
  - `verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean`
  - `createPaymentLink(args): Promise<{ id: string; shortUrl: string; status: string }>`
  - `getPaymentLink(id: string): Promise<RazorpayLink>`
  - `cancelPaymentLink(id: string): Promise<void>`
  - `createRefund(paymentId: string, amountPaise: number, notes?: Record<string,string>): Promise<{ id: string; status: string }>`
  - `getRefund(paymentId: string, refundId: string): Promise<{ id: string; status: string }>`
  - types `RazorpayLink`, `CreatePaymentLinkArgs`.

- [ ] **Step 1: Write the failing signature test.** Create `src/lib/server/razorpay.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from './razorpay';

const secret = 'whsec_test';
const body = JSON.stringify({ event: 'payment_link.paid', x: 1 });
const goodSig = createHmac('sha256', secret).update(body).digest('hex');

test('accepts a correct signature', () => {
  assert.equal(verifyWebhookSignature(body, goodSig, secret), true);
});

test('rejects a tampered body', () => {
  assert.equal(verifyWebhookSignature(body + ' ', goodSig, secret), false);
});

test('rejects a wrong signature without throwing', () => {
  assert.equal(verifyWebhookSignature(body, 'deadbeef', secret), false);
});

test('rejects empty signature', () => {
  assert.equal(verifyWebhookSignature(body, '', secret), false);
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `npm test`
Expected: FAIL — `verifyWebhookSignature` not exported.

- [ ] **Step 3: Implement the adapter.** Create `src/lib/server/razorpay.ts`:

```ts
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const RZP_BASE = 'https://api.razorpay.com/v1';

function authHeader(): string {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error('Razorpay keys are not configured');
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
}

// HMAC-SHA256 of the RAW body. Constant-time compare. Never throws on bad input.
export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature) return false;
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export interface RazorpayLink {
  id: string;
  short_url: string;
  status: string;
  reference_id: string;
  amount: number;
  amount_paid: number;
}

export interface CreatePaymentLinkArgs {
  amountPaise: number;
  referenceId: string;
  description: string;
  customer: { name: string; contact?: string; email?: string };
  notes?: Record<string, string>;
  expireBy?: number; // unix seconds
  callbackUrl?: string;
}

async function rzpFetch(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${RZP_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: authHeader(), ...(init.headers ?? {}) },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = json['error'] as { description?: string } | undefined;
    throw new Error(`Razorpay ${path} ${res.status}: ${errObj?.description ?? JSON.stringify(json)}`);
  }
  return json;
}

export async function createPaymentLink(
  args: CreatePaymentLinkArgs,
): Promise<{ id: string; shortUrl: string; status: string }> {
  const body: Record<string, unknown> = {
    amount: args.amountPaise,
    currency: 'INR',
    reference_id: args.referenceId,
    description: args.description,
    customer: args.customer,
    // We deliver the link ourselves (WhatsApp/email); don't double-notify.
    notify: { sms: false, email: false },
    reminder_enable: true,
    notes: args.notes ?? {},
  };
  if (args.expireBy) body['expire_by'] = args.expireBy;
  if (args.callbackUrl) { body['callback_url'] = args.callbackUrl; body['callback_method'] = 'get'; }

  const json = await rzpFetch('/payment_links', { method: 'POST', body: JSON.stringify(body) });
  return { id: json['id'] as string, shortUrl: json['short_url'] as string, status: json['status'] as string };
}

export async function getPaymentLink(id: string): Promise<RazorpayLink> {
  const json = await rzpFetch(`/payment_links/${id}`, { method: 'GET' });
  return json as unknown as RazorpayLink;
}

export async function cancelPaymentLink(id: string): Promise<void> {
  await rzpFetch(`/payment_links/${id}/cancel`, { method: 'POST', body: '{}' });
}

export async function createRefund(
  paymentId: string, amountPaise: number, notes?: Record<string, string>,
): Promise<{ id: string; status: string }> {
  const json = await rzpFetch(`/payments/${paymentId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ amount: amountPaise, notes: notes ?? {} }),
  });
  return { id: json['id'] as string, status: json['status'] as string };
}

export async function getRefund(paymentId: string, refundId: string): Promise<{ id: string; status: string }> {
  const json = await rzpFetch(`/payments/${paymentId}/refunds/${refundId}`, { method: 'GET' });
  return { id: json['id'] as string, status: json['status'] as string };
}
```

- [ ] **Step 4: Run tests, verify pass.**

Run: `npm test`
Expected: PASS (money + signature tests).

- [ ] **Step 5: Gate + commit.**

Run: `npm run build && npm run lint`
```bash
git add src/lib/server/razorpay.ts src/lib/server/razorpay.test.ts
git commit -m "feat: razorpay adapter (signature verify + payment links + refunds)"
```

> **Doc to check:** Razorpay Payment Links API — https://razorpay.com/docs/api/payments/payment-links/ and webhook signature — https://razorpay.com/docs/webhooks/validate-test/.

---

## Task 5: Razorpay event parser (TDD)

**Files:**
- Create: `src/lib/server/razorpay-events.ts`
- Test: `src/lib/server/razorpay-events.test.ts`

**Interfaces:**
- Produces: `parseRazorpayEvent(body: unknown): ParsedEvent` where
  `ParsedEvent = { kind: 'payment_link_paid' | 'payment_link_partially_paid' | 'payment_link_closed' | 'refund_processed' | 'refund_failed' | 'ignored'; linkId?: string; referenceId?: string; paymentId?: string; amountPaise?: number; amountPaidPaise?: number; refundId?: string }`.

- [ ] **Step 1: Write the failing test.** Create `src/lib/server/razorpay-events.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRazorpayEvent } from './razorpay-events';

test('parses payment_link.paid', () => {
  const ev = {
    event: 'payment_link.paid',
    payload: {
      payment_link: { entity: { id: 'plink_1', reference_id: 'BK-1:advance:v1', amount: 50000, amount_paid: 50000 } },
      payment: { entity: { id: 'pay_1', amount: 50000 } },
    },
  };
  const p = parseRazorpayEvent(ev);
  assert.equal(p.kind, 'payment_link_paid');
  assert.equal(p.linkId, 'plink_1');
  assert.equal(p.referenceId, 'BK-1:advance:v1');
  assert.equal(p.paymentId, 'pay_1');
  assert.equal(p.amountPaise, 50000);
});

test('parses refund.processed', () => {
  const ev = { event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 50000 } } } };
  const p = parseRazorpayEvent(ev);
  assert.equal(p.kind, 'refund_processed');
  assert.equal(p.refundId, 'rfnd_1');
  assert.equal(p.paymentId, 'pay_1');
});

test('ignores unknown events', () => {
  assert.equal(parseRazorpayEvent({ event: 'order.paid', payload: {} }).kind, 'ignored');
  assert.equal(parseRazorpayEvent(null).kind, 'ignored');
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.** Create `src/lib/server/razorpay-events.ts`:

```ts
import 'server-only';

export type ParsedEventKind =
  | 'payment_link_paid' | 'payment_link_partially_paid' | 'payment_link_closed'
  | 'refund_processed' | 'refund_failed' | 'ignored';

export interface ParsedEvent {
  kind: ParsedEventKind;
  linkId?: string;
  referenceId?: string;
  paymentId?: string;
  amountPaise?: number;
  amountPaidPaise?: number;
  refundId?: string;
}

function entity(payload: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const node = payload[key] as { entity?: Record<string, unknown> } | undefined;
  return node?.entity;
}

export function parseRazorpayEvent(body: unknown): ParsedEvent {
  if (!body || typeof body !== 'object') return { kind: 'ignored' };
  const evt = body as { event?: string; payload?: Record<string, unknown> };
  const payload = evt.payload ?? {};

  switch (evt.event) {
    case 'payment_link.paid':
    case 'payment_link.partially_paid': {
      const link = entity(payload, 'payment_link');
      const pay = entity(payload, 'payment');
      return {
        kind: evt.event === 'payment_link.paid' ? 'payment_link_paid' : 'payment_link_partially_paid',
        linkId: link?.['id'] as string | undefined,
        referenceId: link?.['reference_id'] as string | undefined,
        amountPaise: link?.['amount'] as number | undefined,
        amountPaidPaise: link?.['amount_paid'] as number | undefined,
        paymentId: pay?.['id'] as string | undefined,
      };
    }
    case 'payment_link.cancelled':
    case 'payment_link.expired': {
      const link = entity(payload, 'payment_link');
      return { kind: 'payment_link_closed', linkId: link?.['id'] as string | undefined };
    }
    case 'refund.processed':
    case 'refund.failed': {
      const refund = entity(payload, 'refund');
      return {
        kind: evt.event === 'refund.processed' ? 'refund_processed' : 'refund_failed',
        refundId: refund?.['id'] as string | undefined,
        paymentId: refund?.['payment_id'] as string | undefined,
        amountPaise: refund?.['amount'] as number | undefined,
      };
    }
    default:
      return { kind: 'ignored' };
  }
}
```

- [ ] **Step 4: Run tests, verify pass.**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Gate + commit.**

Run: `npm run build && npm run lint`
```bash
git add src/lib/server/razorpay-events.ts src/lib/server/razorpay-events.test.ts
git commit -m "feat: razorpay webhook event parser"
```

---

## Task 6: Webhook route (verify + dedupe + log only) + middleware skip + new-table types/mappers

This task lands a **safe** webhook: it verifies the signature, dedupes, and persists to `webhook_events` — but performs **no money side effects yet** (those arrive in Task 12 / 18). This lets you point Razorpay test mode at the route and confirm delivery + signatures before any state changes.

**Files:**
- Create: `src/lib/types/transactions.ts`
- Create: `src/lib/mappers/transactions.ts`
- Create: `src/app/api/webhooks/razorpay/route.ts`
- Modify: `middleware.ts`

**Interfaces:**
- Consumes: `verifyWebhookSignature`, `parseRazorpayEvent`, `createAdminClient`.
- Produces: types `PaymentLink`, `OutboundMessage`; mappers `dbToPaymentLink`, `paymentLinkToDb`, `dbToOutboundMessage`, `outboundMessageToDb`; the route `POST /api/webhooks/razorpay`.

- [ ] **Step 1: Types.** Create `src/lib/types/transactions.ts`:

```ts
import type {
  PaymentLinkPurpose, PaymentLinkStatus, OutboundChannel, OutboundPurpose, OutboundStatus,
} from '@/lib/constants/transactions';

export interface PaymentLink {
  id: string;
  bookingId: string;
  enquiryId: string | null;
  purpose: PaymentLinkPurpose;
  referenceId: string;
  razorpayLinkId: string | null;
  shortUrl: string | null;
  amount: number;        // paise
  amountPaid: number;    // paise
  currency: string;
  status: PaymentLinkStatus;
  expiresAt: string | null;
  notes: Record<string, unknown> | null;
  createdBy: string;
  createdAt: string;
  paidAt: string | null;
  updatedAt: string;
}

export interface OutboundMessage {
  id: string;
  bookingId: string | null;
  enquiryId: string | null;
  channel: OutboundChannel;
  purpose: OutboundPurpose;
  template: string | null;
  destination: string;
  provider: string | null;
  providerMessageId: string | null;
  status: OutboundStatus;
  error: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Mappers.** Create `src/lib/mappers/transactions.ts`:

```ts
import type { PaymentLink, OutboundMessage } from '@/lib/types/transactions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToPaymentLink(r: Record<string, any>): PaymentLink {
  return {
    id: r['id'], bookingId: r['booking_id'], enquiryId: r['enquiry_id'] ?? null,
    purpose: r['purpose'], referenceId: r['reference_id'],
    razorpayLinkId: r['razorpay_link_id'] ?? null, shortUrl: r['short_url'] ?? null,
    amount: Number(r['amount']), amountPaid: Number(r['amount_paid'] ?? 0),
    currency: r['currency'] ?? 'INR', status: r['status'],
    expiresAt: r['expires_at'] ?? null, notes: r['notes'] ?? null,
    createdBy: r['created_by'] ?? 'system', createdAt: r['created_at'],
    paidAt: r['paid_at'] ?? null, updatedAt: r['updated_at'],
  };
}

export function paymentLinkToDb(p: Partial<PaymentLink> & { id: string }): Record<string, unknown> {
  const out: Record<string, unknown> = { id: p.id };
  if (p.bookingId !== undefined) out['booking_id'] = p.bookingId;
  if (p.enquiryId !== undefined) out['enquiry_id'] = p.enquiryId;
  if (p.purpose !== undefined) out['purpose'] = p.purpose;
  if (p.referenceId !== undefined) out['reference_id'] = p.referenceId;
  if (p.razorpayLinkId !== undefined) out['razorpay_link_id'] = p.razorpayLinkId;
  if (p.shortUrl !== undefined) out['short_url'] = p.shortUrl;
  if (p.amount !== undefined) out['amount'] = p.amount;
  if (p.amountPaid !== undefined) out['amount_paid'] = p.amountPaid;
  if (p.currency !== undefined) out['currency'] = p.currency;
  if (p.status !== undefined) out['status'] = p.status;
  if (p.expiresAt !== undefined) out['expires_at'] = p.expiresAt;
  if (p.notes !== undefined) out['notes'] = p.notes;
  if (p.createdBy !== undefined) out['created_by'] = p.createdBy;
  if (p.paidAt !== undefined) out['paid_at'] = p.paidAt;
  out['updated_at'] = new Date().toISOString();
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToOutboundMessage(r: Record<string, any>): OutboundMessage {
  return {
    id: r['id'], bookingId: r['booking_id'] ?? null, enquiryId: r['enquiry_id'] ?? null,
    channel: r['channel'], purpose: r['purpose'], template: r['template'] ?? null,
    destination: r['destination'] ?? '', provider: r['provider'] ?? null,
    providerMessageId: r['provider_message_id'] ?? null, status: r['status'],
    error: r['error'] ?? null, payload: r['payload'] ?? null,
    createdAt: r['created_at'], updatedAt: r['updated_at'],
  };
}

export function outboundMessageToDb(m: Partial<OutboundMessage> & { id: string }): Record<string, unknown> {
  const out: Record<string, unknown> = { id: m.id };
  if (m.bookingId !== undefined) out['booking_id'] = m.bookingId;
  if (m.enquiryId !== undefined) out['enquiry_id'] = m.enquiryId;
  if (m.channel !== undefined) out['channel'] = m.channel;
  if (m.purpose !== undefined) out['purpose'] = m.purpose;
  if (m.template !== undefined) out['template'] = m.template;
  if (m.destination !== undefined) out['destination'] = m.destination;
  if (m.provider !== undefined) out['provider'] = m.provider;
  if (m.providerMessageId !== undefined) out['provider_message_id'] = m.providerMessageId;
  if (m.status !== undefined) out['status'] = m.status;
  if (m.error !== undefined) out['error'] = m.error;
  if (m.payload !== undefined) out['payload'] = m.payload;
  out['updated_at'] = new Date().toISOString();
  return out;
}
```

- [ ] **Step 3: Webhook route (log-only).** Create `src/app/api/webhooks/razorpay/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyWebhookSignature } from '@/lib/server/razorpay';
import { parseRazorpayEvent } from '@/lib/server/razorpay-events';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // 1. RAW body — read before any parsing so the HMAC matches byte-for-byte.
  const raw = await request.text();
  const signature = request.headers.get('x-razorpay-signature') ?? '';
  const eventId = request.headers.get('x-razorpay-event-id') ?? `evt_${Date.now()}`;
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';

  const valid = verifyWebhookSignature(raw, signature, secret);

  let parsed;
  try { parsed = parseRazorpayEvent(JSON.parse(raw)); } catch { parsed = { kind: 'ignored' as const }; }

  const admin = createAdminClient();

  // 2. Dedupe + audit. Insert-if-new (PK on event id). If it already exists, ack 200.
  const { error: insErr } = await admin.from('webhook_events').insert({
    id: eventId,
    event_type: (JSON.parse(raw || '{}') as { event?: string }).event ?? 'unknown',
    entity_id: parsed.linkId ?? parsed.paymentId ?? parsed.refundId ?? null,
    signature_valid: valid,
    processed: false,
    payload: raw ? JSON.parse(raw) : {},
  });
  // 23505 = unique_violation → already received; treat as success (idempotent replay).
  if (insErr && insErr.code !== '23505') {
    console.error('[razorpay webhook] persist failed', insErr);
    return new Response('error', { status: 500 });
  }
  if (insErr?.code === '23505') return new Response('duplicate', { status: 200 });

  // 3. Reject invalid signatures AFTER logging (so we have the audit trail).
  if (!valid) return new Response('invalid signature', { status: 400 });

  // 4. Side effects are wired in Task 12 / 18. For now: ack.
  await admin.from('webhook_events').update({ processed: true, processed_at: new Date().toISOString() }).eq('id', eventId);
  return new Response('ok', { status: 200 });
}
```

- [ ] **Step 4: Skip the webhook (and future cron) in middleware.** Read `middleware.ts` to find the existing `/api/export` & `/api/print` skip, and extend it. Example edit (match the existing condition's shape):

```ts
// where the matcher / early-return for public API routes lives, add:
if (
  pathname.startsWith('/api/export') ||
  pathname.startsWith('/api/print') ||
  pathname.startsWith('/api/webhooks') ||  // Razorpay — authenticated by signature
  pathname.startsWith('/api/cron')         // Vercel Cron — authenticated by CRON_SECRET
) {
  return NextResponse.next();
}
```

- [ ] **Step 5: Gate.**

Run: `npm run build && npm run lint`
Expected: pass.

- [ ] **Step 6: Manual verify (Razorpay test mode).**
  1. Deploy a preview (`git push` a branch → Vercel preview URL), set `RAZORPAY_WEBHOOK_SECRET` + service-role env on the preview.
  2. In Razorpay Dashboard (Test mode) → Settings → Webhooks → add `https://<preview>/api/webhooks/razorpay`, subscribe to the events in `RAZORPAY_WEBHOOK_EVENTS`, set the same secret.
  3. Click "Send test webhook" (or trigger a test payment-link payment).
  4. Confirm a `webhook_events` row with `signature_valid = true, processed = true`.
  5. Tamper the secret and re-send → expect `signature_valid = false` and HTTP 400.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/types/transactions.ts src/lib/mappers/transactions.ts src/app/api/webhooks/razorpay/route.ts middleware.ts
git commit -m "feat: razorpay webhook route (verify + dedupe + audit) and new-table types/mappers"
```

---

## Task 7: payment_links queries + the engine's reference-id/advance helpers (TDD)

**Files:**
- Create: `src/lib/queries/transactions.ts`
- Create: `src/lib/server/transaction-helpers.ts`
- Test: `src/lib/server/transaction-helpers.test.ts`

**Interfaces:**
- Produces:
  - queries: `getPaymentLinksForBooking(bookingId)`, `getOutboundMessagesForBooking(bookingId)`, `getOpenPaymentLinks()`
  - helpers: `buildReferenceId(bookingId, purpose, version): string`, `parseReferenceId(ref): { bookingId; purpose; version } | null`, `computeAdvance(total, pct): number`, `nextLinkVersion(existingRefs, bookingId, purpose): number`.

- [ ] **Step 1: Write the failing helper test.** Create `src/lib/server/transaction-helpers.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReferenceId, parseReferenceId, computeAdvance, nextLinkVersion } from './transaction-helpers';

test('buildReferenceId is stable and parseable', () => {
  assert.equal(buildReferenceId('BK-1', 'advance', 1), 'BK-1:advance:v1');
  const p = parseReferenceId('BK-1:advance:v1');
  assert.deepEqual(p, { bookingId: 'BK-1', purpose: 'advance', version: 1 });
});

test('parseReferenceId rejects junk', () => {
  assert.equal(parseReferenceId('garbage'), null);
});

test('computeAdvance rounds to whole rupees', () => {
  assert.equal(computeAdvance(10000, 50), 5000);
  assert.equal(computeAdvance(9999, 50), 5000);  // 4999.5 -> 5000
  assert.equal(computeAdvance(10000, 100), 10000);
});

test('computeAdvance clamps pct to 1..100 and total >= 0', () => {
  assert.throws(() => computeAdvance(-1, 50));
  assert.equal(computeAdvance(10000, 0), 10000);   // 0 -> treat as full
  assert.equal(computeAdvance(10000, 150), 10000); // >100 -> full
});

test('nextLinkVersion bumps past the highest existing version for that purpose', () => {
  const refs = ['BK-1:advance:v1', 'BK-1:advance:v2', 'BK-1:balance:v1'];
  assert.equal(nextLinkVersion(refs, 'BK-1', 'advance'), 3);
  assert.equal(nextLinkVersion(refs, 'BK-1', 'balance'), 2);
  assert.equal(nextLinkVersion([], 'BK-9', 'advance'), 1);
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers.** Create `src/lib/server/transaction-helpers.ts`:

```ts
import 'server-only';
import type { PaymentLinkPurpose } from '@/lib/constants/transactions';

export function buildReferenceId(bookingId: string, purpose: PaymentLinkPurpose, version: number): string {
  return `${bookingId}:${purpose}:v${version}`;
}

export function parseReferenceId(ref: string): { bookingId: string; purpose: string; version: number } | null {
  const m = /^(.+):([a-z_]+):v(\d+)$/.exec(ref);
  if (!m) return null;
  return { bookingId: m[1]!, purpose: m[2]!, version: Number(m[3]) };
}

// Advance in RUPEES. pct of 0 or >100 means "collect the full amount".
export function computeAdvance(totalRupees: number, pct: number): number {
  if (!Number.isFinite(totalRupees) || totalRupees < 0) throw new Error('computeAdvance: bad total');
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return Math.round(totalRupees);
  return Math.round(totalRupees * pct / 100);
}

export function nextLinkVersion(existingRefs: string[], bookingId: string, purpose: PaymentLinkPurpose): number {
  let max = 0;
  for (const ref of existingRefs) {
    const p = parseReferenceId(ref);
    if (p && p.bookingId === bookingId && p.purpose === purpose) max = Math.max(max, p.version);
  }
  return max + 1;
}
```

- [ ] **Step 4: Run tests, verify pass.**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Queries.** Create `src/lib/queries/transactions.ts`:

```ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { dbToPaymentLink, dbToOutboundMessage } from '@/lib/mappers/transactions';
import type { PaymentLink, OutboundMessage } from '@/lib/types/transactions';

export async function getPaymentLinksForBooking(bookingId: string): Promise<PaymentLink[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('payment_links')
    .select('*').eq('booking_id', bookingId).order('created_at', { ascending: false });
  return (data ?? []).map(dbToPaymentLink);
}

export async function getOutboundMessagesForBooking(bookingId: string): Promise<OutboundMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('outbound_messages')
    .select('*').eq('booking_id', bookingId).order('created_at', { ascending: false });
  return (data ?? []).map(dbToOutboundMessage);
}

export async function getOpenPaymentLinks(): Promise<PaymentLink[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('payment_links')
    .select('*').in('status', ['created', 'sent', 'partially_paid']);
  return (data ?? []).map(dbToPaymentLink);
}
```

- [ ] **Step 6: Gate + commit.**

Run: `npm run build && npm run lint && npm test`
```bash
git add src/lib/queries/transactions.ts src/lib/server/transaction-helpers.ts src/lib/server/transaction-helpers.test.ts
git commit -m "feat: transaction helpers (reference-id, advance, versioning) + payment_links queries"
```

---

## Task 8: WhatsApp + email adapters

**Files:**
- Create: `src/lib/server/whatsapp.ts`
- Create: `src/lib/server/email.ts`

**Interfaces:**
- Produces:
  - `sendWhatsAppTemplate(to: string, template: string, params: string[], mediaUrl?: string): Promise<{ providerMessageId: string; provider: string }>`
  - `sendEmail(to: string, subject: string, html: string): Promise<{ providerMessageId: string; provider: 'resend' }>`

- [ ] **Step 1: WhatsApp adapter.** Create `src/lib/server/whatsapp.ts`:

```ts
import 'server-only';

export interface WhatsAppResult { providerMessageId: string; provider: string }

// Strip non-digits; ensure country code (default India 91 if a bare 10-digit number).
function normalize(num: string): string {
  const d = num.replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  return d;
}

async function sendTwilio(to: string, template: string, params: string[], mediaUrl?: string): Promise<WhatsAppResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_WHATSAPP_FROM!; // 'whatsapp:+1...'
  const body = new URLSearchParams();
  body.set('From', from);
  body.set('To', `whatsapp:+${normalize(to)}`);
  // Content template (Twilio Content API): ContentSid + variables { "1": "...", ... }
  body.set('ContentSid', template);
  body.set('ContentVariables', JSON.stringify(Object.fromEntries(params.map((v, i) => [String(i + 1), v]))));
  if (mediaUrl) body.set('MediaUrl', mediaUrl);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(`Twilio WhatsApp ${res.status}: ${json.message ?? 'send failed'}`);
  return { providerMessageId: json.sid ?? '', provider: 'twilio' };
}

async function sendGupshup(to: string, template: string, params: string[], mediaUrl?: string): Promise<WhatsAppResult> {
  const apiKey = process.env.GUPSHUP_API_KEY!;
  const source = process.env.GUPSHUP_SOURCE_NUMBER!;
  const appName = process.env.GUPSHUP_APP_NAME!;
  const body = new URLSearchParams();
  body.set('channel', 'whatsapp');
  body.set('source', source);
  body.set('destination', normalize(to));
  body.set('src.name', appName);
  body.set('template', JSON.stringify({ id: template, params }));
  if (mediaUrl) body.set('message', JSON.stringify({ type: 'document', url: mediaUrl }));

  const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as { messageId?: string; message?: string };
  if (!res.ok) throw new Error(`Gupshup WhatsApp ${res.status}: ${json.message ?? 'send failed'}`);
  return { providerMessageId: json.messageId ?? '', provider: 'gupshup' };
}

export async function sendWhatsAppTemplate(
  to: string, template: string, params: string[], mediaUrl?: string,
): Promise<WhatsAppResult> {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'twilio';
  if (!to) throw new Error('WhatsApp: empty destination');
  if (provider === 'gupshup') return sendGupshup(to, template, params, mediaUrl);
  return sendTwilio(to, template, params, mediaUrl);
}
```

- [ ] **Step 2: Email adapter.** Create `src/lib/server/email.ts`:

```ts
import 'server-only';

export async function sendEmail(
  to: string, subject: string, html: string,
): Promise<{ providerMessageId: string; provider: 'resend' }> {
  if (!to) throw new Error('Email: empty destination');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
  });
  const json = (await res.json()) as { id?: string; message?: string };
  if (!res.ok) throw new Error(`Resend ${res.status}: ${json.message ?? 'send failed'}`);
  return { providerMessageId: json.id ?? '', provider: 'resend' };
}
```

- [ ] **Step 3: Gate + commit.**

Run: `npm run build && npm run lint`
```bash
git add src/lib/server/whatsapp.ts src/lib/server/email.ts
git commit -m "feat: whatsapp (twilio/gupshup) + resend email adapters"
```

> **Docs to check:** Twilio Content/WhatsApp — https://www.twilio.com/docs/content ; Gupshup template msg — https://docs.gupshup.io/ ; Resend send — https://resend.com/docs/api-reference/emails/send-email. Confirm the exact template variable shape against your approved templates.

---

## Task 9: messaging layer — compose + send + log

**Files:**
- Create: `src/lib/server/messaging.ts`

**Interfaces:**
- Consumes: `sendWhatsAppTemplate`, `sendEmail`, `outboundMessageToDb`, `formatINR`.
- Produces (all take `(supabase, bookingId, …)` and write `outbound_messages`):
  - `sendPaymentRequest(supabase, booking, link, channelTargets)`
  - `sendVoucher(supabase, booking, voucherUrl)`
  - `sendPaymentReceipt(supabase, booking, amountRupees)`
  - `sendRefundNotice(supabase, booking, amountRupees)`
  - helper `logOutbound(supabase, row)` (never throws).

- [ ] **Step 1: Implement.** Create `src/lib/server/messaging.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppTemplate } from '@/lib/server/whatsapp';
import { sendEmail } from '@/lib/server/email';
import { outboundMessageToDb } from '@/lib/mappers/transactions';
import { formatINR } from '@/lib/utils/money';
import type { OutboundChannel, OutboundPurpose, OutboundStatus } from '@/lib/constants/transactions';

// Minimal booking shape the messaging layer needs (avoids importing the full Booking type churn).
export interface MsgBooking {
  id: string;
  guestName: string;
  contactNumber: string;
  email: string;
  confirmationNumber: string;
  enquiryId?: string | null;
}

async function logOutbound(
  supabase: SupabaseClient,
  row: {
    bookingId: string | null; enquiryId: string | null; channel: OutboundChannel;
    purpose: OutboundPurpose; destination: string; template?: string | null;
    provider?: string | null; providerMessageId?: string | null;
    status: OutboundStatus; error?: string | null; payload?: Record<string, unknown> | null;
  },
): Promise<void> {
  const id = `OM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await supabase.from('outbound_messages').insert(outboundMessageToDb({
    id, bookingId: row.bookingId, enquiryId: row.enquiryId, channel: row.channel,
    purpose: row.purpose, template: row.template ?? null, destination: row.destination,
    provider: row.provider ?? null, providerMessageId: row.providerMessageId ?? null,
    status: row.status, error: row.error ?? null, payload: row.payload ?? null,
  }));
  if (error) console.error('[logOutbound]', error);
}

// Generic: try a channel, log the outcome, swallow errors (delivery must not break the caller).
async function deliver(
  supabase: SupabaseClient, b: MsgBooking, channel: OutboundChannel, purpose: OutboundPurpose,
  template: string | undefined, params: string[], mediaUrl: string | undefined,
  emailSubject: string, emailHtml: string,
): Promise<void> {
  try {
    if (channel === 'whatsapp') {
      if (!template || !b.contactNumber) return;
      const r = await sendWhatsAppTemplate(b.contactNumber, template, params, mediaUrl);
      await logOutbound(supabase, { bookingId: b.id, enquiryId: b.enquiryId ?? null, channel, purpose,
        destination: b.contactNumber, template, provider: r.provider, providerMessageId: r.providerMessageId, status: 'sent' });
    } else {
      if (!b.email) return;
      const r = await sendEmail(b.email, emailSubject, emailHtml);
      await logOutbound(supabase, { bookingId: b.id, enquiryId: b.enquiryId ?? null, channel, purpose,
        destination: b.email, provider: r.provider, providerMessageId: r.providerMessageId, status: 'sent' });
    }
  } catch (e) {
    await logOutbound(supabase, { bookingId: b.id, enquiryId: b.enquiryId ?? null, channel, purpose,
      destination: channel === 'whatsapp' ? b.contactNumber : b.email, status: 'failed',
      error: e instanceof Error ? e.message : String(e) });
  }
}

export async function sendPaymentRequest(
  supabase: SupabaseClient, b: MsgBooking, amountRupees: number, shortUrl: string,
): Promise<void> {
  const amt = formatINR(amountRupees);
  await deliver(supabase, b, 'whatsapp', 'payment_request',
    process.env.WHATSAPP_TEMPLATE_PAYMENT_REQUEST, [b.guestName, b.confirmationNumber, amt, shortUrl], undefined,
    `Payment request — ${b.confirmationNumber}`,
    `<p>Dear ${b.guestName},</p><p>To confirm your booking <b>${b.confirmationNumber}</b>, please pay the advance of <b>${amt}</b>:</p><p><a href="${shortUrl}">${shortUrl}</a></p>`);
  await deliver(supabase, b, 'email', 'payment_request', undefined, [], undefined,
    `Payment request — ${b.confirmationNumber}`,
    `<p>Dear ${b.guestName},</p><p>To confirm your booking <b>${b.confirmationNumber}</b>, please pay the advance of <b>${amt}</b>:</p><p><a href="${shortUrl}">${shortUrl}</a></p>`);
}

export async function sendVoucher(supabase: SupabaseClient, b: MsgBooking, voucherUrl: string): Promise<void> {
  await deliver(supabase, b, 'whatsapp', 'voucher',
    process.env.WHATSAPP_TEMPLATE_VOUCHER, [b.guestName, b.confirmationNumber, voucherUrl], voucherUrl,
    `Your Baghaan booking voucher — ${b.confirmationNumber}`,
    `<p>Dear ${b.guestName},</p><p>Your booking <b>${b.confirmationNumber}</b> is confirmed. View your voucher:</p><p><a href="${voucherUrl}">${voucherUrl}</a></p>`);
  await deliver(supabase, b, 'email', 'voucher', undefined, [], undefined,
    `Your Baghaan booking voucher — ${b.confirmationNumber}`,
    `<p>Dear ${b.guestName},</p><p>Your booking <b>${b.confirmationNumber}</b> is confirmed. View your voucher:</p><p><a href="${voucherUrl}">${voucherUrl}</a></p>`);
}

export async function sendPaymentReceipt(supabase: SupabaseClient, b: MsgBooking, amountRupees: number): Promise<void> {
  const amt = formatINR(amountRupees);
  await deliver(supabase, b, 'whatsapp', 'payment_receipt',
    process.env.WHATSAPP_TEMPLATE_RECEIPT, [b.guestName, b.confirmationNumber, amt], undefined,
    `Payment received — ${b.confirmationNumber}`,
    `<p>Dear ${b.guestName},</p><p>We have received your payment of <b>${amt}</b> for ${b.confirmationNumber}. Thank you.</p>`);
}

export async function sendRefundNotice(supabase: SupabaseClient, b: MsgBooking, amountRupees: number): Promise<void> {
  const amt = formatINR(amountRupees);
  await deliver(supabase, b, 'whatsapp', 'refund_notice',
    process.env.WHATSAPP_TEMPLATE_REFUND, [b.guestName, b.confirmationNumber, amt], undefined,
    `Refund processed — ${b.confirmationNumber}`,
    `<p>Dear ${b.guestName},</p><p>Your refund of <b>${amt}</b> for ${b.confirmationNumber} has been processed.</p>`);
}
```

- [ ] **Step 2: Gate + commit.**

Run: `npm run build && npm run lint`
```bash
git add src/lib/server/messaging.ts
git commit -m "feat: messaging layer (payment request/voucher/receipt/refund over whatsapp+email)"
```

---

## Task 10: transactionEngine.requestAdvance (create link + send)

**Files:**
- Create: `src/lib/server/transactionEngine.ts`

**Interfaces:**
- Consumes: razorpay `createPaymentLink`/`cancelPaymentLink`, `toPaise`/`fromPaise`, helpers (`buildReferenceId`, `computeAdvance`, `nextLinkVersion`), `paymentLinkToDb`, `sendPaymentRequest`.
- Produces:
  - `requestAdvance(supabase, bookingId, opts?: { amountRupees?: number; actor?: string }): Promise<{ shortUrl: string }>`
  - internal `createAndSendLink(supabase, { booking, purpose, amountRupees, actor })`.

- [ ] **Step 1: Implement the engine (advance path).** Create `src/lib/server/transactionEngine.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPaymentLink } from '@/lib/server/razorpay';
import { toPaise } from '@/lib/utils/money';
import { buildReferenceId, computeAdvance, nextLinkVersion } from '@/lib/server/transaction-helpers';
import { paymentLinkToDb } from '@/lib/mappers/transactions';
import { sendPaymentRequest, type MsgBooking } from '@/lib/server/messaging';
import { ADVANCE_DEFAULT_PCT_KEY, ADVANCE_DEFAULT_PCT_FALLBACK, type PaymentLinkPurpose } from '@/lib/constants/transactions';

async function advancePct(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from('meta').select('value').eq('key', ADVANCE_DEFAULT_PCT_KEY).single();
  const n = data ? Number(data.value) : NaN;
  return Number.isFinite(n) ? n : ADVANCE_DEFAULT_PCT_FALLBACK;
}

function toMsgBooking(row: Record<string, unknown>): MsgBooking {
  return {
    id: row['id'] as string,
    guestName: (row['guest_name'] as string) || 'Guest',
    contactNumber: (row['contact_number'] as string) || '',
    email: (row['email'] as string) || '',
    confirmationNumber: (row['confirmation_number'] as string) || '',
    enquiryId: (row['source_enquiry_id'] as string | null) ?? null,
  };
}

async function createAndSendLink(
  supabase: SupabaseClient,
  opts: { row: Record<string, unknown>; purpose: PaymentLinkPurpose; amountRupees: number; actor: string },
): Promise<{ shortUrl: string }> {
  const { row, purpose, amountRupees, actor } = opts;
  const bookingId = row['id'] as string;
  if (!(amountRupees > 0)) throw new Error('Amount must be greater than zero');

  // Idempotent reference id: bump version past any existing link for this (booking, purpose).
  const { data: existing } = await supabase.from('payment_links').select('reference_id').eq('booking_id', bookingId);
  const refs = (existing ?? []).map((r) => r['reference_id'] as string);
  const version = nextLinkVersion(refs, bookingId, purpose);
  const referenceId = buildReferenceId(bookingId, purpose, version);

  const booking = toMsgBooking(row);
  const created = await createPaymentLink({
    amountPaise: toPaise(amountRupees),
    referenceId,
    description: `${purpose.replace('_', ' ')} · ${booking.confirmationNumber}`,
    customer: { name: booking.guestName, contact: booking.contactNumber || undefined, email: booking.email || undefined },
    notes: { bookingId, purpose, confirmationNumber: booking.confirmationNumber },
  });

  const id = `PL-${Date.now()}`;
  const { error } = await supabase.from('payment_links').insert(paymentLinkToDb({
    id, bookingId, enquiryId: booking.enquiryId, purpose, referenceId,
    razorpayLinkId: created.id, shortUrl: created.shortUrl, amount: toPaise(amountRupees),
    amountPaid: 0, currency: 'INR', status: 'sent',
    notes: { confirmationNumber: booking.confirmationNumber }, createdBy: actor,
  }));
  if (error) throw new Error(`Failed to persist payment link: ${error.message}`);

  await sendPaymentRequest(supabase, booking, amountRupees, created.shortUrl);
  return { shortUrl: created.shortUrl };
}

export async function requestAdvance(
  supabase: SupabaseClient, bookingId: string, opts?: { amountRupees?: number; actor?: string },
): Promise<{ shortUrl: string }> {
  const { data: row } = await supabase.from('bookings')
    .select('id, guest_name, contact_number, email, confirmation_number, source_enquiry_id, total_amount, booking_type')
    .eq('id', bookingId).single();
  if (!row) throw new Error('Booking not found');

  const total = Number(row['total_amount'] ?? 0);
  if (!(total > 0)) throw new Error('Set the package total before requesting an advance.');

  const amount = opts?.amountRupees ?? computeAdvance(total, await advancePct(supabase));
  if (amount > total) throw new Error('Advance cannot exceed the total amount.');

  return createAndSendLink(supabase, {
    row, purpose: 'advance', amountRupees: amount, actor: opts?.actor ?? 'system',
  });
}
```

- [ ] **Step 2: Gate + commit.**

Run: `npm run build && npm run lint`
```bash
git add src/lib/server/transactionEngine.ts
git commit -m "feat(engine): requestAdvance — create razorpay link + send payment request"
```

---

## Task 11: sendAdvanceRequest action + enquiry-hold UI button

**Files:**
- Create: `src/lib/actions/transactions.ts`
- Modify: the enquiry-hold UI (find with grep in Step 3)

**Interfaces:**
- Consumes: `requestAdvance`.
- Produces: action `sendAdvanceRequest(bookingId, amountRupees?): Promise<ActionResult<{ shortUrl: string }>>`.

- [ ] **Step 1: Action.** Create `src/lib/actions/transactions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { requestAdvance } from '@/lib/server/transactionEngine';

async function getAuthedUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', user.id).single();
  if (!profile) return null;
  return { id: user.id, name: profile.name as string, role: profile.role as string };
}

export async function sendAdvanceRequest(
  bookingId: string, amountRupees?: number,
): Promise<ActionResult<{ shortUrl: string }>> {
  if (!bookingId) return err('Booking ID required');
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Admin'].includes(actor.role)) return err('Only Sales and Admin can request payments');

  try {
    const opts: { actor: string; amountRupees?: number } = { actor: actor.name };
    if (amountRupees !== undefined) opts.amountRupees = amountRupees;
    const res = await requestAdvance(supabase, bookingId, opts);
    revalidatePath('/enquiries');
    revalidatePath('/bookings');
    return ok(res);
  } catch (e) {
    console.error('[sendAdvanceRequest]', e);
    return err(e instanceof Error ? e.message : 'Failed to create payment link');
  }
}
```

- [ ] **Step 2: Gate.**

Run: `npm run build && npm run lint`
Expected: pass.

- [ ] **Step 3: Find the enquiry-hold UI.**

Run: `rg -l "blockEnquiryRooms|releaseEnquiryHold|rooms_blocked" src/components src/app`
Open the component that renders the hold/advance step for an enquiry (likely under `src/components/enquiries/`).

- [ ] **Step 4: Wire a "Send advance request" button.** In that client component, add an action call (follow the file's existing `useState` + `sonner` toast pattern — match the surrounding code):

```tsx
import { toast } from 'sonner';
import { sendAdvanceRequest } from '@/lib/actions/transactions';

// inside the component, for an enquiry whose hold booking id is `heldBookingId`:
async function handleSendAdvance() {
  const res = await sendAdvanceRequest(heldBookingId);
  if (res.success) toast.success('Payment link sent to guest');
  else toast.error(res.error);
}
```

Render the button only when `status === 'rooms_blocked'` or `'advance_pending'` and the user has Sales/Admin permissions (reuse `usePermissions()`).

- [ ] **Step 5: Gate + manual check.**

Run: `npm run build && npm run lint`
Manually (test mode): block an enquiry's rooms, set a total, click "Send advance request" → a `payment_links` row (`status='sent'`) + an `outbound_messages` row appear; the guest receives the WhatsApp/email with a working Razorpay test link.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/actions/transactions.ts src/components/enquiries
git commit -m "feat: send advance payment request from enquiry hold"
```

---

## Task 12: engine.onPaymentLinkPaid + wire webhook side effects

**Files:**
- Modify: `src/lib/server/transactionEngine.ts`
- Modify: `src/app/api/webhooks/razorpay/route.ts`

**Interfaces:**
- Consumes: `parseRazorpayEvent` output, `fromPaise`, `purposeToPaymentType`, existing `paymentToDb`, existing `syncEnquiryStageFromPayment`/`runCorporateAutomation` logic (re-implemented to take the admin client).
- Produces: `onPaymentLinkPaid(supabase, parsed)`, `onPaymentLinkPartiallyPaid(supabase, parsed)`.

> **Reuse note:** `syncEnquiryStageFromPayment` and `onPaymentVerified` currently live as private functions in `src/lib/actions/payments.ts` and close over the cookie client. The engine needs the same behaviour with the **admin** client. Extract them into a shared `src/lib/server/payment-sync.ts` that takes a `SupabaseClient` param, and have `payments.ts` import from there (DRY — no logic duplication).
>
> **Client-type note:** the engine/sync modules type their Supabase param as `SupabaseClient` from `@supabase/supabase-js`, so both the cookie client (`await createClient()`) and the admin client satisfy it. `corporateEngine.ts` currently types its `SB` alias as `Awaited<ReturnType<typeof createClient>>`. If Step 2's build complains about passing a `SupabaseClient` into `runCorporateAutomation`/`logCorporateActivity`, widen `corporateEngine.ts`'s `SB` alias to `import('@supabase/supabase-js').SupabaseClient` (one-line change; behaviour-preserving).

- [ ] **Step 1: Extract payment-sync into a shared, client-agnostic module.** Create `src/lib/server/payment-sync.ts` by moving the bodies of `syncEnquiryStageFromPayment` and `onPaymentVerified` out of `payments.ts`, typed against `SupabaseClient`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { logCorporateActivity, runCorporateAutomation } from '@/lib/server/corporateEngine';

export async function onPaymentVerified(
  supabase: SupabaseClient, bookingId: string, amount: number, actor: { id: string; name: string },
): Promise<void> {
  const { data: b } = await supabase.from('bookings').select('booking_type').eq('id', bookingId).single();
  if (b?.['booking_type'] === 'corporate') {
    await logCorporateActivity(supabase, bookingId, 'payment_verified',
      `Payment of ₹${amount.toLocaleString('en-IN')} verified.`, actor);
  }
  await runCorporateAutomation(supabase, bookingId, actor);
}

export async function syncEnquiryStageFromPayment(supabase: SupabaseClient, bookingId: string): Promise<void> {
  const { data: b } = await supabase.from('bookings')
    .select('source_enquiry_id, status').eq('id', bookingId).single();
  const enquiryId = b?.['source_enquiry_id'] as string | null;
  if (!enquiryId) return;
  if (b?.['status'] !== 'hold') return;

  const { data: pays } = await supabase.from('payments').select('verified').eq('booking_id', bookingId);
  const relevant = pays ?? [];
  const hasVerified = relevant.some((p) => p['verified'] === true);
  const hasAny = relevant.length > 0;
  const stage = hasVerified ? 'advance_confirmed' : hasAny ? 'advance_pending' : 'rooms_blocked';

  await supabase.from('enquiries')
    .update({ status: stage, updated_at: new Date().toISOString() })
    .eq('id', enquiryId).eq('held_booking_id', bookingId);
  revalidatePath('/enquiries');
}
```

Then in `src/lib/actions/payments.ts`, delete the two private copies and import them:
```ts
import { onPaymentVerified, syncEnquiryStageFromPayment } from '@/lib/server/payment-sync';
```
(Leave all call sites unchanged — signatures match, `supabase` is already passed.)

- [ ] **Step 2: Gate (refactor must be behaviour-preserving).**

Run: `npm run build && npm run lint`
Expected: pass (no call-site changes needed).

- [ ] **Step 3: Add the paid handlers to the engine.** Append to `src/lib/server/transactionEngine.ts`:

```ts
import { fromPaise } from '@/lib/utils/money';
import { paymentToDb } from '@/lib/mappers/payment';
import { purposeToPaymentType } from '@/lib/constants/transactions';
import { onPaymentVerified, syncEnquiryStageFromPayment } from '@/lib/server/payment-sync';
import type { ParsedEvent } from '@/lib/server/razorpay-events';
import type { Payment } from '@/lib/types/payment';

const SYSTEM_ACTOR = { id: 'razorpay-webhook', name: 'Razorpay (auto)' };

// Records a captured Razorpay payment into the ledger (idempotent), advances enquiry/corporate
// state, but does NOT confirm the booking — that stays a human click (bookEnquiry).
export async function onPaymentLinkPaid(supabase: SupabaseClient, ev: ParsedEvent): Promise<void> {
  if (!ev.linkId || !ev.paymentId) return;

  const { data: link } = await supabase.from('payment_links').select('*').eq('razorpay_link_id', ev.linkId).single();
  if (!link) { console.error('[onPaymentLinkPaid] no link for', ev.linkId); return; }

  const bookingId = link['booking_id'] as string;
  const amountRupees = fromPaise(ev.amountPaise ?? Number(link['amount']));

  // Idempotency: a unique index guards razorpay_payment_id, but check first to avoid a noisy error.
  const { data: dup } = await supabase.from('payments').select('id').eq('razorpay_payment_id', ev.paymentId).maybeSingle();
  if (dup) return;

  const now = new Date().toISOString();
  const payment: Payment = {
    id: `PAY-${Date.now()}`,
    bookingId,
    paymentDate: now.slice(0, 10),
    amount: amountRupees,
    mode: 'razorpay',
    reference: ev.paymentId,
    type: purposeToPaymentType(link['purpose']),
    notes: `Razorpay ${link['purpose']} · link ${ev.linkId}`,
    verified: true,
    verifiedBy: SYSTEM_ACTOR.name,
    verifiedAt: now,
    recordedAt: now,
    recordedBy: SYSTEM_ACTOR.name,
    recordedByRole: 'System',
    refundStatus: null,
  };
  const dbRow = { ...paymentToDb(payment), razorpay_payment_id: ev.paymentId, razorpay_link_id: ev.linkId };
  const { error: insErr } = await supabase.from('payments').insert(dbRow);
  if (insErr && insErr.code !== '23505') { console.error('[onPaymentLinkPaid] insert', insErr); return; }

  await supabase.from('payment_links').update({
    status: 'paid', amount_paid: ev.amountPaidPaise ?? Number(link['amount']),
    paid_at: now, updated_at: now,
  }).eq('id', link['id']);

  await onPaymentVerified(supabase, bookingId, amountRupees, SYSTEM_ACTOR);
  await syncEnquiryStageFromPayment(supabase, bookingId);
}

export async function onPaymentLinkPartiallyPaid(supabase: SupabaseClient, ev: ParsedEvent): Promise<void> {
  if (!ev.linkId) return;
  await supabase.from('payment_links').update({
    status: 'partially_paid', amount_paid: ev.amountPaidPaise ?? 0, updated_at: new Date().toISOString(),
  }).eq('razorpay_link_id', ev.linkId);
  // Deliberately NO auto-verify on a short advance — a human reconciles partials.
}
```

- [ ] **Step 4: Wire the handlers into the webhook.** In `src/app/api/webhooks/razorpay/route.ts`, replace the Task-6 "Side effects … For now: ack" block with a dispatch:

```ts
import { onPaymentLinkPaid, onPaymentLinkPartiallyPaid } from '@/lib/server/transactionEngine';
// ...
  try {
    if (parsed.kind === 'payment_link_paid') await onPaymentLinkPaid(admin, parsed);
    else if (parsed.kind === 'payment_link_partially_paid') await onPaymentLinkPartiallyPaid(admin, parsed);
    else if (parsed.kind === 'payment_link_closed') {
      if (parsed.linkId) await admin.from('payment_links')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('razorpay_link_id', parsed.linkId).in('status', ['created', 'sent', 'partially_paid']);
    }
    // refund_processed / refund_failed wired in Task 18.
    await admin.from('webhook_events').update({ processed: true, processed_at: new Date().toISOString() }).eq('id', eventId);
  } catch (e) {
    await admin.from('webhook_events').update({ error: e instanceof Error ? e.message : String(e) }).eq('id', eventId);
    console.error('[razorpay webhook] handler', e);
    return new Response('handler error', { status: 500 });  // Razorpay retries on non-2xx
  }
  return new Response('ok', { status: 200 });
```

- [ ] **Step 5: Gate.**

Run: `npm run build && npm run lint`
Expected: pass.

- [ ] **Step 6: Manual end-to-end (test mode).** Block rooms → set total → send advance → pay the Razorpay **test** link. Verify: a `payments` row (`mode='razorpay'`, `verified=true`, `razorpay_payment_id` set); `payment_links.status='paid'`; the enquiry advances to `advance_confirmed`; the **booking is still `hold`** (human gate intact). Re-send the same webhook from the dashboard → **no** duplicate payment row.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/server/payment-sync.ts src/lib/actions/payments.ts src/lib/server/transactionEngine.ts src/app/api/webhooks/razorpay/route.ts
git commit -m "feat(engine): webhook records+verifies razorpay payments idempotently; advances enquiry/corporate"
```

---

## Task 13: Real voucher dispatch on confirm

**Files:**
- Modify: `src/lib/actions/dispatch.ts`

**Interfaces:**
- Consumes: `sendVoucher`, the existing `getVoucherShareUrl` (in `vouchers.ts`).
- Produces: `dispatchVoucher(bookingId)` actually sends (signature unchanged, so `bookEnquiry` is untouched).

- [ ] **Step 1: Rewrite `dispatchVoucher`.** Replace the stub body in `src/lib/actions/dispatch.ts`:

```ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { ok, err, type ActionResult } from '@/lib/types/result';
import { sendVoucher, type MsgBooking } from '@/lib/server/messaging';
import { getVoucherShareUrl } from '@/lib/actions/vouchers';

export async function dispatchVoucher(bookingId: string): Promise<ActionResult> {
  if (!bookingId) return err('Booking ID required');
  const supabase = await createClient();

  const { data: row } = await supabase.from('bookings')
    .select('id, guest_name, contact_number, email, confirmation_number, source_enquiry_id')
    .eq('id', bookingId).single();
  if (!row) return err('Booking not found');

  const booking: MsgBooking = {
    id: row['id'] as string,
    guestName: (row['guest_name'] as string) || 'Guest',
    contactNumber: (row['contact_number'] as string) || '',
    email: (row['email'] as string) || '',
    confirmationNumber: (row['confirmation_number'] as string) || '',
    enquiryId: (row['source_enquiry_id'] as string | null) ?? null,
  };

  const voucherUrl = await getVoucherShareUrl(bookingId);
  await sendVoucher(supabase, booking, voucherUrl); // never throws; logs per-channel
  return ok(undefined);
}
```

- [ ] **Step 2: Gate.**

Run: `npm run build && npm run lint`
Expected: pass.

- [ ] **Step 3: Manual check.** Complete a flow to `advance_confirmed`, click **Confirm booking** (`bookEnquiry`) → booking flips to `confirmed`, the guest receives the voucher on WhatsApp + email, and two `outbound_messages` rows (`purpose='voucher'`) appear.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/actions/dispatch.ts
git commit -m "feat: dispatchVoucher actually sends the voucher over whatsapp + email"
```

---

## Task 14: Payment-receipt acknowledgement on capture

**Files:**
- Modify: `src/lib/server/transactionEngine.ts`

**Interfaces:**
- Consumes: `sendPaymentReceipt`.
- Produces: `onPaymentLinkPaid` also sends a receipt ack.

- [ ] **Step 1: Add the ack.** In `onPaymentLinkPaid` (Task 12), after `syncEnquiryStageFromPayment(...)`, add:

```ts
await sendPaymentReceipt(supabase, toMsgBooking(
  (await supabase.from('bookings')
    .select('id, guest_name, contact_number, email, confirmation_number, source_enquiry_id')
    .eq('id', bookingId).single()).data as Record<string, unknown>,
), amountRupees);
```

And extend the messaging import at the top of the file:
```ts
import { sendPaymentRequest, sendPaymentReceipt, type MsgBooking } from '@/lib/server/messaging';
```

- [ ] **Step 2: Gate + manual + commit.**

Run: `npm run build && npm run lint`
Manual: pay a test link → guest gets a "payment received" message; an `outbound_messages` row `purpose='payment_receipt'` appears.
```bash
git add src/lib/server/transactionEngine.ts
git commit -m "feat(engine): send payment-receipt acknowledgement on capture"
```

---

## Task 15: Balance / final-bill links

**Files:**
- Modify: `src/lib/server/transactionEngine.ts`
- Modify: `src/lib/actions/transactions.ts`
- Modify: the booking/front-office UI (grep in Step 3)

**Interfaces:**
- Produces: `requestBalance(supabase, bookingId, opts?: { amountRupees?: number; actor?: string })`; action `sendBalanceRequest(bookingId, amountRupees?)`.

- [ ] **Step 1: Engine.** Append to `transactionEngine.ts`:

```ts
// Outstanding = total (or final bill) − verified payments, in rupees.
export async function requestBalance(
  supabase: SupabaseClient, bookingId: string, opts?: { amountRupees?: number; actor?: string },
): Promise<{ shortUrl: string }> {
  const { data: row } = await supabase.from('bookings')
    .select('id, guest_name, contact_number, email, confirmation_number, source_enquiry_id, total_amount, final_bill, booking_type')
    .eq('id', bookingId).single();
  if (!row) throw new Error('Booking not found');

  const finalBill = row['final_bill'] as { totalAmount?: number } | null;
  const billTotal = finalBill && Number(finalBill.totalAmount ?? 0) > 0
    ? Number(finalBill.totalAmount) : Number(row['total_amount'] ?? 0);

  const { data: pays } = await supabase.from('payments')
    .select('amount, verified, type').eq('booking_id', bookingId);
  const paid = (pays ?? [])
    .filter((p) => p['verified'] === true && p['type'] !== 'refund')
    .reduce((s, p) => s + Number(p['amount'] ?? 0), 0);

  const outstanding = Math.max(0, Math.round(billTotal - paid));
  const amount = opts?.amountRupees ?? outstanding;
  if (!(amount > 0)) throw new Error('Nothing outstanding to collect.');
  if (amount > outstanding) throw new Error('Amount exceeds the outstanding balance.');

  const purpose = finalBill && Number(finalBill.totalAmount ?? 0) > 0 ? 'final_bill' : 'balance';
  return createAndSendLink(supabase, { row, purpose, amountRupees: amount, actor: opts?.actor ?? 'system' });
}
```

- [ ] **Step 2: Action.** Append to `src/lib/actions/transactions.ts`:

```ts
import { requestBalance } from '@/lib/server/transactionEngine';

export async function sendBalanceRequest(
  bookingId: string, amountRupees?: number,
): Promise<ActionResult<{ shortUrl: string }>> {
  if (!bookingId) return err('Booking ID required');
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Front Office', 'Admin'].includes(actor.role)) return err('Insufficient permissions');
  try {
    const opts: { actor: string; amountRupees?: number } = { actor: actor.name };
    if (amountRupees !== undefined) opts.amountRupees = amountRupees;
    const res = await requestBalance(supabase, bookingId, opts);
    revalidatePath('/bookings'); revalidatePath('/front-office'); revalidatePath('/accounts');
    return ok(res);
  } catch (e) {
    console.error('[sendBalanceRequest]', e);
    return err(e instanceof Error ? e.message : 'Failed to create balance link');
  }
}
```

- [ ] **Step 3: UI.** `rg -l "Front Office|checkInCorporate|balance" src/components/front-office src/components/bookings`, then add a **"Request balance"** button (Sales/FO/Admin) on a confirmed/checked-in booking, calling `sendBalanceRequest(bookingId)` with the same toast pattern as Task 11.

- [ ] **Step 4: Gate + manual + commit.**

Run: `npm run build && npm run lint`
Manual: on a confirmed booking with an outstanding balance, click "Request balance" → link for the exact outstanding amount; pay it → a `type='balance'` verified payment is recorded.
```bash
git add src/lib/server/transactionEngine.ts src/lib/actions/transactions.ts src/components
git commit -m "feat(engine): balance / final-bill payment links"
```

---

## Task 16: Corporate PI advance link

**Files:**
- Modify: `src/lib/server/transactionEngine.ts`
- Modify: `src/lib/actions/transactions.ts`
- Modify: `src/components/corporate/*` (grep in Step 3)

**Interfaces:**
- Produces: `requestCorporateAdvance(supabase, bookingId, opts?)`; action `sendCorporateAdvanceRequest(bookingId)`.

- [ ] **Step 1: Engine.** Append to `transactionEngine.ts`:

```ts
export async function requestCorporateAdvance(
  supabase: SupabaseClient, bookingId: string, opts?: { actor?: string },
): Promise<{ shortUrl: string }> {
  const { data: row } = await supabase.from('bookings')
    .select('id, guest_name, contact_number, email, confirmation_number, source_enquiry_id, proforma_invoice, booking_type')
    .eq('id', bookingId).single();
  if (!row) throw new Error('Booking not found');
  if (row['booking_type'] !== 'corporate') throw new Error('Not a corporate booking');

  const pi = row['proforma_invoice'] as { advanceRequired?: number } | null;
  const advance = pi ? Number(pi.advanceRequired ?? 0) : 0;
  if (!(advance > 0)) throw new Error('Generate the proforma invoice (with an advance) first.');

  return createAndSendLink(supabase, {
    row, purpose: 'corporate_advance', amountRupees: advance, actor: opts?.actor ?? 'system',
  });
}
```

- [ ] **Step 2: Action.** Append to `transactions.ts`:

```ts
import { requestCorporateAdvance } from '@/lib/server/transactionEngine';

export async function sendCorporateAdvanceRequest(bookingId: string): Promise<ActionResult<{ shortUrl: string }>> {
  if (!bookingId) return err('Booking ID required');
  const supabase = await createClient();
  const actor = await getAuthedUser(supabase);
  if (!actor) return err('Not authenticated');
  if (!['Sales', 'Sales Admin', 'Admin'].includes(actor.role)) return err('Only Sales and Admin can request payments');
  try {
    const res = await requestCorporateAdvance(supabase, bookingId, { actor: actor.name });
    revalidatePath('/corporate');
    return ok(res);
  } catch (e) {
    console.error('[sendCorporateAdvanceRequest]', e);
    return err(e instanceof Error ? e.message : 'Failed to create corporate advance link');
  }
}
```

- [ ] **Step 3: UI.** `rg -l "generateProformaInvoice|pi_generated|advanceRequired" src/components/corporate`, then add a **"Send advance link"** button on the PI step. Corporate confirmation stays automation-driven: once the webhook records the verified advance, the existing `runCorporateAutomation` promotes `pi_generated → confirmed`.

- [ ] **Step 4: Gate + manual + commit.**

Run: `npm run build && npm run lint`
Manual: generate a PI, send the advance link, pay it → `runCorporateAutomation` flips the corporate stage to `confirmed` and the booking to `confirmed`.
```bash
git add src/lib/server/transactionEngine.ts src/lib/actions/transactions.ts src/components/corporate
git commit -m "feat(engine): corporate PI advance payment link"
```

---

## Task 17: Razorpay refunds — issueRefund + rewire initiateRefund

**Files:**
- Modify: `src/lib/server/transactionEngine.ts`
- Modify: `src/lib/actions/payments.ts` (`initiateRefund`)

**Interfaces:**
- Consumes: razorpay `createRefund`, `toPaise`.
- Produces: `issueRefund(supabase, bookingId, { amountRupees, actor })` → creates a Razorpay refund against the original payment and writes a `pending` refund ledger row with `razorpay_refund_id`.

- [ ] **Step 1: Engine.** Append to `transactionEngine.ts`:

```ts
// Refund the most recent verified Razorpay payment on a cancelled booking.
export async function issueRefund(
  supabase: SupabaseClient, bookingId: string, args: { amountRupees: number; actor: { id: string; name: string; role: string } },
): Promise<{ refundId: string }> {
  if (!(args.amountRupees > 0)) throw new Error('Refund amount must be greater than zero');

  const { data: src } = await supabase.from('payments')
    .select('razorpay_payment_id, amount')
    .eq('booking_id', bookingId).eq('verified', true).not('razorpay_payment_id', 'is', null)
    .neq('type', 'refund').order('recorded_at', { ascending: false }).limit(1).maybeSingle();
  if (!src?.['razorpay_payment_id']) throw new Error('No Razorpay payment found to refund against.');
  if (args.amountRupees > Number(src['amount'])) throw new Error('Refund exceeds the original payment.');

  const refund = await createRefund(src['razorpay_payment_id'] as string, toPaise(args.amountRupees),
    { bookingId, reason: 'cancellation' });

  const now = new Date().toISOString();
  const { error } = await supabase.from('payments').insert({
    id: `PAY-${Date.now()}`, booking_id: bookingId, payment_date: now.slice(0, 10),
    amount: args.amountRupees, mode: 'razorpay', reference: refund.id, type: 'refund', notes: 'Razorpay refund',
    verified: false, recorded_at: now, recorded_by: args.actor.name, recorded_by_role: args.actor.role,
    refund_status: 'pending', razorpay_refund_id: refund.id, razorpay_payment_id: null,
  });
  if (error) throw new Error(`Refund created at Razorpay but ledger insert failed: ${error.message}`);
  return { refundId: refund.id };
}
```

- [ ] **Step 2: Rewire `initiateRefund`.** In `src/lib/actions/payments.ts`, replace the manual insert in `initiateRefund` with the engine call (keeping the cancelled-booking guard and role check). After the `bk.status === 'cancelled'` check:

```ts
import { issueRefund } from '@/lib/server/transactionEngine';
// ...
  try {
    const { refundId } = await issueRefund(supabase, input.bookingId, {
      amountRupees: input.amount, actor,
    });
    revalidatePaymentPaths();
    return ok({ id: refundId });
  } catch (e) {
    console.error('[initiateRefund]', e);
    return err(e instanceof Error ? e.message : 'Failed to initiate refund');
  }
```

(Keep `markRefundDone` as the manual path for offline/non-Razorpay refunds.)

- [ ] **Step 3: Gate + commit.**

Run: `npm run build && npm run lint`
```bash
git add src/lib/server/transactionEngine.ts src/lib/actions/payments.ts
git commit -m "feat(engine): issueRefund via razorpay; initiateRefund routes through it"
```

---

## Task 18: Refund webhook handler + refund notice

**Files:**
- Modify: `src/lib/server/transactionEngine.ts`
- Modify: `src/app/api/webhooks/razorpay/route.ts`

**Interfaces:**
- Produces: `onRefundProcessed(supabase, ev)`, `onRefundFailed(supabase, ev)`.

- [ ] **Step 1: Engine.** Append to `transactionEngine.ts`:

```ts
import { sendRefundNotice } from '@/lib/server/messaging';

export async function onRefundProcessed(supabase: SupabaseClient, ev: ParsedEvent): Promise<void> {
  if (!ev.refundId) return;
  const { data: rowAfter } = await supabase.from('payments')
    .update({ refund_status: 'done' }).eq('razorpay_refund_id', ev.refundId).select('booking_id, amount').maybeSingle();
  if (!rowAfter) return;

  const { data: bk } = await supabase.from('bookings')
    .select('id, guest_name, contact_number, email, confirmation_number, source_enquiry_id')
    .eq('id', rowAfter['booking_id']).single();
  if (bk) await sendRefundNotice(supabase, toMsgBooking(bk as Record<string, unknown>), Number(rowAfter['amount']));
}

export async function onRefundFailed(supabase: SupabaseClient, ev: ParsedEvent): Promise<void> {
  if (!ev.refundId) return;
  // Leave the ledger row 'pending' and flag it for a human via the webhook_events error trail.
  console.error('[onRefundFailed] refund failed at Razorpay', ev.refundId);
}
```

- [ ] **Step 2: Wire into webhook.** In the route's dispatch block (Task 12 Step 4), add before the `processed` update:

```ts
import { onRefundProcessed, onRefundFailed } from '@/lib/server/transactionEngine';
// ...
    else if (parsed.kind === 'refund_processed') await onRefundProcessed(admin, parsed);
    else if (parsed.kind === 'refund_failed') await onRefundFailed(admin, parsed);
```

- [ ] **Step 3: Gate + manual + commit.**

Run: `npm run build && npm run lint`
Manual (test mode): refund a test payment from the dashboard → the `refund.processed` webhook flips the ledger row to `refund_status='done'` and the guest gets a refund notice.
```bash
git add src/lib/server/transactionEngine.ts src/app/api/webhooks/razorpay/route.ts
git commit -m "feat(engine): refund.processed webhook marks refund done + notifies guest"
```

---

## Task 19: Reconciliation cron (safety net)

**Files:**
- Create: `src/app/api/cron/reconcile-payments/route.ts`
- Create: `vercel.json`
- Modify: `src/lib/server/transactionEngine.ts` (add `reconcileOpenLinks`)

**Interfaces:**
- Consumes: razorpay `getPaymentLink`, `parseRazorpayEvent` shape, `onPaymentLinkPaid`.
- Produces: `reconcileOpenLinks(supabase)`; cron route `GET /api/cron/reconcile-payments`.

- [ ] **Step 1: Engine reconcile.** Append to `transactionEngine.ts`:

```ts
import { getPaymentLink } from '@/lib/server/razorpay';

// Poll Razorpay for non-terminal links and apply the paid handler if Razorpay shows paid.
// Covers webhooks that were missed/delayed.
export async function reconcileOpenLinks(supabase: SupabaseClient): Promise<{ checked: number; reconciled: number }> {
  const { data: open } = await supabase.from('payment_links')
    .select('id, razorpay_link_id, amount')
    .in('status', ['created', 'sent', 'partially_paid'])
    .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()); // older than 10 min

  let reconciled = 0;
  for (const link of open ?? []) {
    const rzpId = link['razorpay_link_id'] as string | null;
    if (!rzpId) continue;
    const remote = await getPaymentLink(rzpId);
    if (remote.status === 'paid') {
      // Synthesize the same shape onPaymentLinkPaid expects. payment id comes from the link's payments[].
      const payments = (remote as unknown as { payments?: Array<{ payment_id?: string }> }).payments ?? [];
      const paymentId = payments[0]?.payment_id;
      if (paymentId) {
        await onPaymentLinkPaid(supabase, {
          kind: 'payment_link_paid', linkId: rzpId, referenceId: remote.reference_id,
          paymentId, amountPaise: remote.amount, amountPaidPaise: remote.amount_paid,
        });
        reconciled++;
      }
    } else if (remote.status === 'cancelled' || remote.status === 'expired') {
      await supabase.from('payment_links').update({ status: remote.status, updated_at: new Date().toISOString() })
        .eq('id', link['id']);
    }
  }
  return { checked: (open ?? []).length, reconciled };
}
```

- [ ] **Step 2: Cron route.** Create `src/app/api/cron/reconcile-payments/route.ts`:

```ts
import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { reconcileOpenLinks } from '@/lib/server/transactionEngine';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response('unauthorized', { status: 401 });

  const admin = createAdminClient();
  const result = await reconcileOpenLinks(admin);
  return Response.json(result);
}
```

- [ ] **Step 3: Vercel schedule.** Create `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/reconcile-payments", "schedule": "*/15 * * * *" }
  ]
}
```

- [ ] **Step 4: Gate + manual + commit.**

Run: `npm run build && npm run lint`
Manual: with `CRON_SECRET` set, `curl -H "Authorization: Bearer <secret>" https://<preview>/api/cron/reconcile-payments` → JSON `{ checked, reconciled }`; a deliberately "missed" paid link gets reconciled.
```bash
git add src/lib/server/transactionEngine.ts src/app/api/cron/reconcile-payments/route.ts vercel.json
git commit -m "feat: reconciliation cron for missed razorpay webhooks"
```

> **Doc to check:** Vercel Cron auth + schedule — https://vercel.com/docs/cron-jobs (cron jobs run only on production deployments).

---

## Task 20: Surface link + message status in the UI

**Files:**
- Modify: an Accounts or Vouchers client component (grep in Step 1)
- Consumes: `getPaymentLinksForBooking`, `getOutboundMessagesForBooking`.

- [ ] **Step 1: Find the surface.** `rg -l "getPayments|payments" src/app/\(app\)/accounts src/components/payments src/components/vouchers` and pick the booking/payment detail view.

- [ ] **Step 2: Load + render.** In the relevant `page.tsx` (server component), fetch alongside existing data:

```ts
import { getPaymentLinksForBooking, getOutboundMessagesForBooking } from '@/lib/queries/transactions';
// const [links, messages] = await Promise.all([...]) per booking detail
```

Pass as `initialPaymentLinks` / `initialMessages` to the client component and render a small panel: each link's `purpose`, `formatINR(fromPaise(amount))`, `status` (color-coded), `shortUrl` (copy button); each message's `channel`, `purpose`, `status`, `createdAt`. Reuse existing badge/table styling from the surrounding component.

- [ ] **Step 3: Gate + commit.**

Run: `npm run build && npm run lint`
```bash
git add src/app src/components
git commit -m "feat: show payment-link and message-delivery status on booking detail"
```

---

## Final verification (after all tasks)

- [ ] `npm test` — all unit tests pass.
- [ ] `npm run build && npm run lint` — clean.
- [ ] **Full test-mode rehearsal:** enquiry → block → send advance → pay → auto-record/verify → Confirm booking → voucher delivered → request balance → pay → cancel a different booking → refund → refund notice. Confirm `webhook_events` shows every event `processed=true`, no duplicate ledger rows on webhook replay, and booking confirmation never happened without a human click.
- [ ] **Go-live checklist:** swap `RAZORPAY_*` to live keys + a live webhook secret; register the production webhook URL; confirm Vercel Cron is enabled on production; approve WhatsApp templates with the BSP and set the `WHATSAPP_TEMPLATE_*` names.
```
