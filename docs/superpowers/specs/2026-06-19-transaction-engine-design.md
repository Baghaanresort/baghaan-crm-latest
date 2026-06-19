# Transaction Engine — Design Spec

**Date:** 2026-06-19
**Status:** Approved (design) → ready for implementation plan
**Scope:** Automate Baghaan's transactional flow — advance collection, balance/final-bill
collection, corporate PI advance, and refunds — via Razorpay Payment Links, a signed
webhook, and WhatsApp (BSP) + email delivery. Single-tenant (Baghaan) with seams toward
the multi-tenant SaaS direction in `2026-06-15-MASTER-PLAN.md` (this is that plan's "Phase 2").

---

## 1. Goal & problem

Today the money flow is manual and stubbed:

- **Advance collection** is hand-keyed. `addPayment` (`src/lib/actions/payments.ts`) requires
  someone to type amount/mode/reference; nothing is collected online.
- **Verification** is a manual bottleneck. `verifyPayment` requires Accounts/Admin to click
  verify on each payment before an enquiry reaches `advance_confirmed`.
- **Voucher / payment-request sending is not real.** `dispatchVoucher`
  (`src/lib/actions/dispatch.ts`) only writes `logged` rows to `voucher_dispatches`; its own
  comment says "SP2 replaces the body with real Resend + WhatsApp BSP sends." No message and
  no payment link is ever sent.
- **Corporate** (`corporate.ts` + `corporateEngine.ts`) marks cost sheets/PIs "sent" without
  actually sending, and relies on the same manual record→verify gap.

**We want a transaction engine** (Booking.com / MakeMyTrip style): block rooms → auto-generate
a Razorpay advance link → send it on WhatsApp with booking details → guest pays → a signed
webhook auto-records and auto-verifies the money → a human clicks **Confirm booking** → the
real voucher goes out on WhatsApp + email. The same engine handles balance/final-bill links,
corporate PI advances, and Razorpay refunds.

## 2. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Razorpay surface | **Payment Links + webhooks** (server creates a link per charge; we send it; webhook reconciles) |
| 2 | WhatsApp delivery | **Own WhatsApp Business API via a BSP** (Gupshup/Twilio) behind a swappable adapter, selected by `WHATSAPP_PROVIDER` |
| 3 | Automation trust | **Money side fully automatic** (link → pay → webhook → recorded + verified); **hold→confirmed + voucher send is a 1-click human action** |
| 4 | Scope | **Everything**: advance, balance/final-bill, corporate PI advance, refunds |
| 5 | Advance policy | **Default 50% of total**, stored as an overridable setting; the request modal pre-fills it, the agent can change it per booking |
| 6 | Hosting | **Vercel** (Node webhook route + Vercel Cron for reconciliation) |

**Design intent of #3:** the friction we remove is *data entry + reconciliation*, not the final
human confirm. Razorpay payments arrive only via webhook, pre-verified. The guest-facing voucher
is dispatched only when a human confirms the booking (`bookEnquiry`).

## 3. Architecture (Approach A — webhook-reconciled engine + thin adapters)

Mirrors the existing `actions → server → mappers → queries` layering. Razorpay's webhook is the
source of truth for money; a Vercel Cron reconcile job is the safety net.

### New server-only modules (`src/lib/server/`)

- **`razorpay.ts`** — REST wrapper. `createPaymentLink`, `getPaymentLink`, `cancelPaymentLink`,
  `createRefund`, `getRefund`, `verifyWebhookSignature(rawBody, signature)`. Reads
  `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`. Never imported by client code.
- **`whatsapp.ts`** — BSP adapter. `sendTemplate(to, templateName, params, mediaUrl?) →
  { providerMessageId }`. One interface; provider chosen by `WHATSAPP_PROVIDER` (gupshup|twilio).
- **`email.ts`** — Resend wrapper. `sendEmail(to, subject, html, attachments?)`.
- **`messaging.ts`** — composes content from a booking and writes the send log:
  `sendPaymentRequest`, `sendVoucher`, `sendBalanceRequest`, `sendPaymentReceipt`,
  `sendRefundNotice`. Channel-agnostic (WhatsApp + email), writes `outbound_messages`.
- **`transactionEngine.ts`** — the orchestrator (the "engine"):
  - `requestAdvance(bookingId, { amount? })`
  - `requestBalance(bookingId, { amount })`
  - `requestCorporateAdvance(bookingId)` (uses PI `advanceRequired`)
  - `requestFinalBill(bookingId)` (uses final-bill balance)
  - `issueRefund(bookingId, { amount, paymentId })`
  - `onPaymentLinkPaid(event)` / `onPaymentLinkPartiallyPaid(event)` / `onRefundProcessed(event)`
  - `reconcileOpenLinks()` / `reconcilePendingRefunds()` (cron entry points)

### New / changed routes

- **`src/app/api/webhooks/razorpay/route.ts`** (new) — reads the **raw** body via
  `await request.text()`, verifies `x-razorpay-signature` (HMAC-SHA256 with
  `RAZORPAY_WEBHOOK_SECRET`, `crypto.timingSafeEqual`), dedupes on `x-razorpay-event-id`,
  hands off to the engine, returns `200` fast. `runtime = 'nodejs'`. Writes via the
  service-role admin client (no user session — authenticated by signature).
- **`src/app/api/cron/reconcile-payments/route.ts`** (new) — Vercel Cron target. Guarded by
  `CRON_SECRET`. Polls Razorpay for non-terminal links/refunds and applies the same handlers.
- **`middleware.ts`** — add `/api/webhooks` and `/api/cron` to the existing skip list (next to
  `/api/export` & `/api/print`).
- **`vercel.json`** (new) — Cron schedule (e.g. every 15 min) hitting the reconcile route.

### Thin action wrappers (`src/lib/actions/`)

User-triggered buttons call thin actions that re-check role and delegate to the engine:
`sendAdvanceRequest`, `sendBalanceRequest`, `sendCorporateAdvanceRequest`. These run on the
cookie-bound client (RLS) for reads + role check, then invoke the engine.

## 4. Data model (`supabase/migrations/009_transaction_engine.sql`)

> **Money unit:** Razorpay works in **paise** (integer). `payment_links.amount` is stored in
> **paise**; the `payments` ledger stays in **rupees** (existing). The engine converts at the
> boundary (`toPaise`/`fromPaise`). This is the single most bug-prone seam — assert it in code.

### `payment_links` — bridge between a booking and a Razorpay link

| column | type | notes |
|--------|------|-------|
| id | text PK | `PL-<ts>` |
| booking_id | text NOT NULL | FK `bookings.id` |
| enquiry_id | text NULL | FK `enquiries.id` when sourced from an enquiry hold |
| purpose | text NOT NULL | `advance` \| `balance` \| `corporate_advance` \| `final_bill` |
| reference_id | text NOT NULL UNIQUE | idempotency key, `${booking_id}:${purpose}:v${n}` |
| razorpay_link_id | text NULL | `plink_…`, set after creation |
| short_url | text NULL | the link we send |
| amount | integer NOT NULL | **paise** |
| amount_paid | integer NOT NULL DEFAULT 0 | **paise** |
| currency | text NOT NULL DEFAULT 'INR' | |
| status | text NOT NULL DEFAULT 'created' | `created`\|`sent`\|`partially_paid`\|`paid`\|`cancelled`\|`expired` |
| expires_at | timestamptz NULL | Razorpay link expiry |
| notes | jsonb NULL | snapshot: confirmation #, guest name |
| created_by | text NOT NULL | actor name or `system` |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| paid_at | timestamptz NULL | |
| updated_at | timestamptz | |

Indexes: `razorpay_link_id`, `booking_id`, `status`.

### `webhook_events` — inbound Razorpay event log (idempotency + audit + replay)

| column | type | notes |
|--------|------|-------|
| id | text PK | `x-razorpay-event-id` header → **dedupe** |
| event_type | text NOT NULL | e.g. `payment_link.paid`, `refund.processed` |
| entity_id | text NULL | `plink_…` / `pay_…` / `rfnd_…` from payload |
| signature_valid | boolean NOT NULL | |
| processed | boolean NOT NULL DEFAULT false | |
| processed_at | timestamptz NULL | |
| error | text NULL | |
| payload | jsonb NOT NULL | full event |
| received_at | timestamptz NOT NULL DEFAULT now() | |

### `outbound_messages` — replaces the `voucher_dispatches` stub

| column | type | notes |
|--------|------|-------|
| id | text PK | `OM-<ts>` |
| booking_id | text NULL | |
| enquiry_id | text NULL | |
| channel | text NOT NULL | `whatsapp` \| `email` |
| purpose | text NOT NULL | `payment_request`\|`voucher`\|`balance_request`\|`final_bill_request`\|`payment_receipt`\|`refund_notice` |
| template | text NULL | BSP template name |
| destination | text NOT NULL | phone / email |
| provider | text NULL | `gupshup`\|`twilio`\|`resend` |
| provider_message_id | text NULL | for delivery tracking |
| status | text NOT NULL DEFAULT 'queued' | `queued`\|`sent`\|`delivered`\|`read`\|`failed` |
| error | text NULL | |
| payload | jsonb NULL | template params snapshot |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz | |

`voucher_dispatches` is left in place (historical) and `dispatchVoucher` is repointed at
`outbound_messages`.

### `payments` — additive columns (no destructive change)

- `razorpay_payment_id text NULL` + **partial unique index** `WHERE razorpay_payment_id IS NOT NULL` (idempotency)
- `razorpay_link_id text NULL`
- `razorpay_refund_id text NULL` (for `type='refund'` rows)
- `mode` gains `'razorpay'` as a valid value.

### Settings

Store `advance_default_pct = '50'` in the existing `meta` key/value table (alongside
`booking_counter`, `pi_counter`). Seam for per-tenant settings later.

## 5. End-to-end flows

### 5.1 Advance (regular enquiry hold)

1. Agent blocks rooms (`blockEnquiryRooms`) and sets the package total. A **Send advance request**
   button calls `sendAdvanceRequest` → `engine.requestAdvance`.
2. Engine computes advance (`round(total * advance_default_pct/100)`, agent-overridable),
   creates an **idempotent** Razorpay link (`reference_id`), writes `payment_links`, and
   `messaging.sendPaymentRequest` fires a WhatsApp template (booking details + pay link) + email.
   Enquiry → `advance_pending`.
3. Guest pays → Razorpay fires `payment_link.paid` → webhook verifies signature, dedupes, calls
   `engine.onPaymentLinkPaid`:
   - insert a `payments` row (`mode='razorpay'`, `type='advance'`, `verified=true`,
     `verified_by='razorpay-webhook'`, `razorpay_payment_id`, idempotent), in **rupees**;
   - update `payment_links` → `paid`;
   - call existing `syncEnquiryStageFromPayment` → enquiry → `advance_confirmed`;
   - `messaging.sendPaymentReceipt` (optional WhatsApp ack).
4. **Human gate:** agent clicks **Confirm booking** (`bookEnquiry`, unchanged gate — requires
   `advance_confirmed`). Hold→confirmed and `dispatchVoucher` (now real) sends the voucher PDF
   over WhatsApp + email.

### 5.2 Balance / final bill

`requestBalance` / `requestFinalBill` create a link for the outstanding amount → WhatsApp/email →
webhook records a `type='balance'` payment. For corporate, the existing `runCorporateAutomation`
promotes the stage to `completed` once the verified total settles the final bill.

### 5.3 Corporate PI advance

`generateProformaInvoice` already computes `advanceRequired` (50%). `requestCorporateAdvance`
creates a link for that amount. Webhook → verified payment → existing `runCorporateAutomation`
promotes `pi_generated`→`confirmed`. **Corporate confirmation stays automation-driven** (it is a
pipeline stage, not a guest voucher); the human-confirm gate applies to the regular voucher path.

### 5.4 Refund (cancellation)

On approval of a cancellation (`decideRequest` → booking `cancelled`), `initiateRefund` calls
`engine.issueRefund` → `razorpay.createRefund` against the original `razorpay_payment_id`; the
`payments` refund row stays `pending` until `refund.processed` webhook flips it to `done` and
`messaging.sendRefundNotice` notifies the guest. Manual `markRefundDone` is kept for offline refunds.

## 6. Money state machine

```
hold ──(advance link sent)──► advance_pending ──[webhook paid]──► advance_confirmed
  └─ human "Confirm booking" ─► confirmed (voucher sent) ─► checked_in ─► checked_out
                                                              │
                                          (balance link) ─► settled / completed
cancelled ──(Razorpay refund)──► refund pending ──[webhook]──► refunded
```

Underpayment → link `partially_paid`, **no** auto-verify of the full advance; flagged for a human.
Overpayment → recorded as paid; surplus visible in the ledger for manual handling.

## 7. Production-grade guarantees

- **Idempotency**
  - `webhook_events.id` unique (event id) → insert-on-conflict-do-nothing; already-processed → 200 immediately.
  - `payments` partial-unique on `razorpay_payment_id` → a replayed payment never double-credits.
  - `payment_links.reference_id` unique per (booking, purpose, version) → Razorpay rejects dup; we catch and reuse the existing active link.
- **Signature verification** on every webhook (HMAC-SHA256, `timingSafeEqual`); invalid → log to `webhook_events` with `signature_valid=false`, return 400, **no side effects**.
- **Reconciliation safety net** — Vercel Cron polls Razorpay for non-terminal links/refunds older than N minutes and applies the same handlers, covering missed/late webhooks.
- **Amount matching** — webhook amount (paise) must equal `payment_links.amount`; mismatch is logged and **not** auto-verified.
- **Coexistence** — manual `addPayment` (offline cash/UPI) and `verifyPayment` are unchanged; Razorpay payments only ever enter via webhook.
- **Security / RLS** — new tables have RLS enabled (read: Accounts/Sales/Admin; `webhook_events` Admin-only). Webhook + cron write via the **service-role admin client**; user-triggered engine calls use the cookie client and re-check role. No Razorpay/WhatsApp secret ever reaches the client.
- **Fast webhook** — verify + dedupe + persist, process inline (work is small), return 200. Inngest/queue is a documented seam for multi-tenant scale, not built now.

## 8. Environment & deployment (Vercel)

```
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
WHATSAPP_PROVIDER=gupshup            # gupshup | twilio
GUPSHUP_API_KEY= / TWILIO_ACCOUNT_SID= TWILIO_AUTH_TOKEN= TWILIO_WHATSAPP_FROM=
WHATSAPP_SOURCE_NUMBER=
WHATSAPP_TEMPLATE_PAYMENT_REQUEST=   # approved template names
WHATSAPP_TEMPLATE_VOUCHER=
WHATSAPP_TEMPLATE_RECEIPT=
RESEND_API_KEY=
APP_BASE_URL=https://…
CRON_SECRET=
```

- **Webhook URL:** `https://<app>/api/webhooks/razorpay`, registered in the Razorpay dashboard for
  events `payment_link.paid`, `payment_link.partially_paid`, `payment_link.cancelled`,
  `payment_link.expired`, `refund.processed`, `refund.failed`. Separate secret per test/live mode.
- **Cron:** `vercel.json` → `/api/cron/reconcile-payments` every 15 min, `CRON_SECRET`-guarded.
- The voucher PDF/document is sent by URL using the existing HMAC share link
  (`getVoucherShareUrl` → `/api/voucher/view`); no new public-file infra needed.

## 9. Integration changes to existing code

| File | Change |
|------|--------|
| `actions/dispatch.ts` | Replace the stub: `dispatchVoucher` → `messaging.sendVoucher` (real WhatsApp + email), writes `outbound_messages`. Signature unchanged so `bookEnquiry` is untouched. |
| `actions/payments.ts` | Unchanged for manual entry. Engine reuses `syncEnquiryStageFromPayment` + `onPaymentVerified`/`runCorporateAutomation`. |
| `actions/enquiries.ts` | `bookEnquiry` gate unchanged. New UI button → `sendAdvanceRequest` thin action. |
| `actions/corporate.ts` | `generateProformaInvoice` unchanged; add `sendCorporateAdvanceRequest`. |
| `actions/payments.ts` `initiateRefund` | Route through `engine.issueRefund` (Razorpay); webhook completes it. Keep manual `markRefundDone`. |
| `middleware.ts` | Skip `/api/webhooks` and `/api/cron`. |

## 10. Build phases (for the implementation plan)

1. **Foundation:** migration `009`, `razorpay.ts` + `whatsapp.ts` + `email.ts` + `messaging.ts` skeletons, env wiring, webhook route with signature verify + `webhook_events` logging (no side effects). Verify signatures in Razorpay **test mode**.
2. **Advance collect:** `requestAdvance` + `sendPaymentRequest` + `payment_links` + `onPaymentLinkPaid` → `payments` ledger + enquiry sync. End-to-end in test mode.
3. **Confirm + voucher:** real `dispatchVoucher` (WhatsApp + email) on human confirm + payment-receipt ack.
4. **Balance + corporate:** `requestBalance` / `requestFinalBill` / `requestCorporateAdvance`.
5. **Refunds:** `issueRefund` + `refund.processed` webhook + notice.
6. **Reconcile + visibility:** Vercel Cron reconcile job + link/message status surfaced in the Accounts/Vouchers UI.

## 11. Non-goals (this plan)

- Multi-tenant Razorpay Route / split settlements (future MASTER-PLAN phase).
- Self-serve onboarding, AI capture/follow-up.
- A custom-branded hosted checkout page (we use Razorpay-hosted Payment Links).
- Replacing offline/manual payment entry (it coexists).

## 12. Risks & mitigations

- **WhatsApp template approval lead time** (BSP) → email fallback ships first; WhatsApp flips on once templates approve.
- **Test→live key/secret swap** → separate webhook secret per mode; gate live behind a checklist.
- **Partial/overpayment edge cases** → explicit `partially_paid` handling + human flag; never auto-verify a short advance.
- **Vercel raw-body parsing** → read `await request.text()` before any JSON parse so the signature matches.
- **Missed webhooks** → reconcile cron is the backstop.
```
