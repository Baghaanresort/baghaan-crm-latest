# Baghaan CRM → Hospitality SaaS — End-to-End Architecture, System Design & Strategy

**Date:** 2026-06-15 · **Status:** Strategic + technical plan for review (no code written yet)
**Scope:** market research → product strategy & moat → high-level architecture (tools/libs) →
end-to-end system design → scaling, selling & pricing → phased roadmap → risks.
**Builds on:** `2026-06-15-multi-tenant-saas-plan.md` (the tenancy mechanics) and
`2026-06-15-ai-workflow-automation-plan.md` (the AI layer).

---

## 1. Market research — how the incumbents work, scale, sell & defend

### 1.1 Who's who
 
| Product | Segment | Core model |
| --- | --- | --- |
| **Cloudbeds** | Independent hotels/hostels, global | All-in-one PMS + booking engine + channel manager + payments + "Signals" AI; 350+ app integrations, 300+ distribution channels |
| **Mews** | Modern/boutique & groups | Guest self-service (online check-in/out, kiosks), API-first, 1,000+ integrations, #1 PMS in 2025 HotelTechAwards |
| **Hostaway** | Vacation/short-term rentals | Channel sync (Airbnb/Booking/VRBO), automated guest messaging; 20,000+ managers |
| **RoomRaccoon** | Small/independent hotels | Guest app, ancillary-revenue upsells, strong support/ROI |
| **Hotelogix** | India + 100 countries, mid-market | Cloud PMS, GST-ready, OTA integrations; 10,000+ properties |
| **eZee (Yanolja)** | India budget/mid, global | Full suite, 25,000+ properties, GST-compliant |
| **Djubo** | Indian independents/resorts | PMS + CRS + booking engine + channel manager, dynamic pricing, analytics |

### 1.2 How they *function*
A modern PMS/CRM is a **hub** that comes alive through integrations: a **channel manager**
pushes availability/rates to OTAs + GDS, a **booking engine** captures direct bookings, a
**payment gateway** settles money, and the **CRM/guest-profile** layer personalizes and
re-markets. Reservations, rates, availability, folios and guest profiles flow automatically
between systems in real time. The architecture trend is **cloud-native, API-first** ("API-
everything") so hotels grow without new hardware per site.

### 1.3 How they *scale*
- **Shared cloud multi-tenancy** with a centralized DB syncing in real time across a group's
  properties (a guest's profile/loyalty appears at every property instantly).
- **API-first** so integrations and multi-property roll-ups are additive, not rewrites.
- **Integration marketplaces** (350–1,000+ apps) — partners do the long-tail work.

### 1.4 How they *sell* (GTM & pricing)
- **Pricing:** per-room/month (~$1–4, India ≈ ₹3,000–6,000/mo for 50 rooms) or occupancy-based;
  subscription models now >70% of new implementations in a market projected ~$12.5B (2025).
- **Hidden revenue:** transaction fees, OTA-sync fees, support tiers, onboarding — often
  +30–60% over headline price.
- **Channels:** inbound (G2/Capterra/HotelTechReport reviews), OTA/partner ecosystems,
  hotel-association/reseller channels, and enterprise custom deals for groups.

### 1.5 Their *moat* (this is the important part)
1. **Embedded payments = the real business.** Subscription-plus-transaction can lift revenue
   per customer **2–5×**. (Toast: ~$5B financial services vs ~$936M software.) Once payments,
   payouts, deposits run through you, a $99/mo tool becomes a multi-thousand-$/yr financial
   account — **huge switching cost.**
2. **Operational lock-in.** When daily operations (reservations, folios, channel sync) depend on
   you, churn collapses.
3. **Data/AI moat.** Industry-specific operational data → benchmarks, demand forecasting,
   dynamic pricing that horizontal tools can't replicate. Compounds over time.
4. **Integration network effects.** Each OTA/POS/accounting connector raises the cost of leaving.

> **Strategic takeaway for us:** software alone is a commodity. The defensible business is
> **vertical SaaS + embedded payments + a proprietary data/AI layer**, wedged into a niche the
> incumbents underserve.

---

## 2. Product strategy & positioning

### 2.1 The wedge (don't fight Cloudbeds head-on)
Baghaan is a **resort with a rich enquiry→corporate→group pipeline** (cost sheets, proforma
invoices, BTC, GST). Most cheap Indian PMSs are weak exactly there. **Wedge = the best
sales/enquiry-to-booking CRM for Indian resorts & group/corporate-heavy properties**, with
GST/PI/voucher workflows native — then expand outward into PMS/channel/payments.

### 2.2 Ideal customer profile (ICP)
Independent Indian resorts & boutique properties (20–80 rooms) with meaningful **corporate/group
and event business**, currently run on spreadsheets + a basic PMS.

### 2.3 Moat we will build (in order)
1. **Workflow depth** in enquiry→quote→PI→advance→booking (already our strength).
2. **Embedded payments** (Razorpay) — advances, deposits, final bills, with auto-reconciliation.
3. **AI layer** (see AI plan) trained on accumulating enquiry/booking data → conversion scoring,
   dynamic quoting, demand insight.
4. **Channel/OTA + accounting integrations** to become the operational hub.

---

## 3. High-level architecture (tools / libs / methods)

> Principle: **keep the proven core** (Next.js 16 + Supabase + RLS) and add SaaS-grade
> capabilities as discrete, swappable services. Don't rewrite; extend.

### 3.1 Already in place (keep)
Next.js 16 (App Router, RSC) · React 19 · Supabase (Postgres + Auth + RLS + Storage) ·
Tailwind v4 · Zod v4 · react-hook-form · framer-motion · sonner. Layered flow:
page → client → queries → `'use server'` actions (`ActionResult<T>`) → mappers.

### 3.2 Add for multi-tenant SaaS

| Concern | Tool / method | Notes |
| --- | --- | --- |
| **Tenancy** | Postgres RLS + `resort_id` + `current_resort_ids()` | Shared-DB model (per `multi-tenant-saas-plan.md`); schema-per-tenant only for future enterprise |
| **Org/RBAC** | `resorts` + `memberships` + per-tenant roles | Org switcher; `Owner` role above ops `Admin` |
| **Billing/subscriptions** | **Stripe Billing** (global) or **Razorpay Subscriptions** (India/UPI/GST) | Plans, trials, metered add-ons; webhook → set `resorts.status` |
| **Embedded payments** | **Razorpay** (UPI/cards/netbanking, GST invoices) + Payment Links | The moat; auto-reconcile to the VERIFY step |
| **Background jobs / queues** | **Supabase Queues + pg_cron**, or **Inngest**/**Trigger.dev** | Reminders, channel sync, voucher dispatch, AI extraction |
| **Transactional email** | **Resend** (or Postmark) + **React Email** | Vouchers, PIs, receipts, lifecycle emails |
| **WhatsApp / SMS** | **WhatsApp Business Cloud API** (via Gupshup/AiSensy for India) + **MSG91** | Guest comms + AI concierge |
| **AI** | **Anthropic Claude** — Haiku 4.5 (extract/classify), Sonnet 4.6 (drafting), Opus 4.8 (reasoning); tool-use + Zod-validated JSON | Per AI plan; never mutates DB directly |
| **File/PDF** | Supabase Storage + existing React-PDF print routes | Per-tenant branding on vouchers/PIs/bills |
| **Search/analytics** | Postgres FTS + materialized views; **Metabase** for ops dashboards | Avoid premature warehouse |
| **Observability** | **Sentry** (errors) + **PostHog** (product analytics/funnels) + structured logs | Track activation/conversion |
| **Channel manager / OTA** | Integrate via aggregator (**eZee/Djubo/RateGain** APIs) or build later | Buy-vs-build; integrate first |
| **Search infra at scale** | Read replicas, pgBouncer, partial indexes | Only when load demands |

### 3.3 Deployment & infra
- **Vercel** for Next.js (edge/CDN, preview deploys) + **Supabase** (managed Postgres, Auth,
  Storage, Realtime). Region: India (Mumbai) for latency + data residency.
- **CI/CD:** GitHub Actions — `npm run build` (typecheck gate) + migration apply + nightly DB
  backup (already planned). Add migration linting and an RLS policy test suite.
- **Secrets:** per-env in Vercel/Supabase; service-role key never client-side.
- **Domains:** single domain + org switcher now; custom domains / subdomains later (out of scope).

---

## 4. End-to-end system design

### 4.1 Logical layers
```
 Clients:  Web (Next.js RSC)  ·  Guest WhatsApp  ·  Booking engine (public)  ·  Admin console
                                   │
 Edge:     Middleware (auth + active-tenant resolution)  ·  CDN
                                   │
 App:      Server Components → Queries (read) → Server Actions (write, Zod-validated)
                                   │
 Domain:   Enquiry · Booking · Payment · Corporate · Voucher · Guest · Rooms/Rates
                                   │
 Platform: Tenancy/RLS · Billing · Payments · Jobs/Queues · Notifications · AI · Integrations
                                   │
 Data:     Postgres (RLS, per-tenant) · Storage · Realtime  ·  External: OTAs, Razorpay, WhatsApp
```

### 4.2 Tenancy & isolation
- Shared DB, `resort_id` on every tenant table, RLS policies = the wall (full mechanics in the
  tenancy plan). `memberships` for users↔resort↔role. Active tenant resolved in middleware →
  available to every RSC without prop-drilling.
- Service-role/admin & platform ops bypass RLS and **must** filter `resort_id` manually.

### 4.3 Core domain flow (unchanged, now tenant-scoped)
Enquiry (`new→in_progress→rooms_blocked→advance_pending→advance_confirmed→booked`) →
Booking (regular/corporate; hold-expiry; `checkRoomConflict` scoped by resort) →
Payment (advance/final via Razorpay, auto-reconciled) → Voucher / Final bill (per-tenant branding) →
Check-in (FO, ID OCR) → Stay (requests) → Check-out.

### 4.4 Integration layer (the hub)
- **Inbound:** OTA reservations + payment webhooks → normalized → domain events.
- **Outbound:** availability/rates → channel manager → OTAs; receipts/vouchers → email/WhatsApp.
- **Pattern:** an `integrations` module with adapter per provider; idempotent webhook handlers;
  an `events`/outbox table for reliable delivery via the queue.

### 4.5 Billing & lifecycle
`resorts.plan / plan_limits / status` drive enforcement. Webhooks from Stripe/Razorpay move
`trial → active → suspended`. **Suspended = read-only** (enforced in actions + UI). Plan limits
(max users/rooms/bookings) checked inside actions.

### 4.6 AI subsystem
Server actions call Claude with **tool-use** (read availability/rates/history) and emit
**Zod-validated JSON**; humans approve anything money/room/guest-facing. Every suggestion +
approver logged (extends `booking_history`/activities). Data compounds into the moat.

### 4.7 Security, compliance & data residency
- RLS treated as **code**: version-controlled, reviewed, and **tested** (policy test suite).
- **GST** invoicing native; **India DPDP Act** — consent, retention, data-subject requests; PII
  (IDs/phones) minimization, encryption at rest (Supabase), audit logs.
- Per-tenant data export + delete (offboarding); least-privilege service keys; webhook signature
  verification; rate limiting on public booking-engine endpoints.

### 4.8 Scaling path (don't pre-build)
1. **0–50 tenants:** single Supabase project, RLS, Vercel. Today's stack handles it.
2. **50–500:** pgBouncer/connection pooling, read replicas, materialized views for dashboards,
   queue-backed jobs, caching (per-request + CDN).
3. **500+ / enterprise:** schema-per-tenant or dedicated DB for compliance-heavy clients;
   sharding by region; data warehouse (BigQuery/ClickHouse) for analytics; SSO/SAML.

### 4.9 Observability & ops
Sentry (errors), PostHog (activation/conversion funnels, feature usage), uptime monitoring,
nightly backups + tested restore, migration safety (expand-then-contract), feature flags for
staged rollout.

---

## 5. How we scale & sell (business mechanics)

### 5.1 Pricing (proposed)
- **Tiered per-property subscription** (not per-seat — staff count varies): Starter / Pro /
  Group, gated by rooms, users, and features (channel manager, AI, multi-property).
- **Embedded-payments take rate** on advances/bills (the 2–5× revenue lever).
- **Add-ons:** WhatsApp concierge, AI quoting, extra integrations.
- Indian benchmark to undercut/match: ₹3,000–6,000/mo for ~50 rooms.

### 5.2 GTM
- **Land** with the enquiry→booking CRM wedge (corporate/group depth) for independent resorts.
- **Distribution:** HotelTechReport/G2/Capterra reviews, hotelier associations, regional
  resellers, referrals; content on GST/PI/group-booking pain.
- **Expand** within account: payments → channel manager → AI → multi-property.
- **Onboarding** is the activation moat: seed rooms/rates, import data, white-glove first tenant.

### 5.3 Moat compounding
Payments lock-in + operational dependence + accumulating data/AI + integration network effects.
Each new tenant and transaction widens it.

---

## 6. Phased roadmap (each phase shippable)

| Phase | Theme | Outcome |
| --- | --- | --- |
| **0** | Tenancy foundation | RLS isolation, `resorts/memberships/rooms`, Baghaan as tenant #1 (see tenancy plan) |
| **1** | App scoping + super-admin onboarding | Onboard tenant #2 by hand; per-tenant rooms/rates/branding/counters |
| **2** | Billing + embedded payments | Razorpay subscriptions + transaction payments; suspend lifecycle |
| **3** | Self-serve signup + plan limits | Resorts onboard themselves; activation funnel |
| **4** | AI layer (capture + follow-up first) | Conversion lift; data moat begins (see AI plan) |
| **5** | Integrations hub | Channel manager/OTA + accounting; becomes operational hub |
| **6** | Scale & enterprise | Read replicas, multi-property roll-ups, SSO, analytics warehouse |

---

## 7. Key risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Competing head-on with Cloudbeds/Mews | Win the corporate/group + GST wedge first; don't boil the ocean |
| Payments/compliance complexity (KYC, settlement) | Use Razorpay's managed flows; phase payments after tenancy is solid |
| Channel-manager build is huge | Integrate via aggregator APIs before building our own |
| RLS misconfig = cross-tenant leak | RLS-as-code: tests, reviews, isolation probes in CI |
| Data residency / DPDP | India region, consent + retention + export/delete from day one |
| Scaling prematurely | Follow the staged scaling path; don't pre-build sharding/warehouse |
| AI hallucinating money/rooms | Tool-grounded, Zod-validated, human-approved (AI plan) |

---

## 8. Recommendation
Sequence is everything: **Tenancy (0–1) → Payments (2) → Self-serve (3) → AI (4) → Integrations (5).**
Build the **payments + data/AI moat** deliberately — that, not the CRM features, is the defensible
business. Land on the **corporate/group + GST wedge** where incumbents are weak, then expand into
the operational hub.

---

### Sources
- [Cloudbeds vs RoomRaccoon (Hotel Tech Report)](https://hoteltechreport.com/compare/cloudbeds-hms-vs-roomraccoon-hms)
- [Hostaway vs Cloudbeds (GetApp)](https://www.getapp.com/hospitality-travel-software/a/hostaway/compare/cloudbeds/)
- [Mews vs Cloudbeds](https://www.mews.com/en/compare/mews-vs-cloudbeds)
- [Hotel PMS Integration guide (RoomMaster)](https://www.roommaster.com/blog/hotel-pms-integration)
- [Multi-property hotel software (Prostay)](https://www.prostay.com/blog/multi-property-hotel-management-software/)
- [Hospitality SaaS pricing (Monetizely)](https://www.getmonetizely.com/articles/how-do-hospitality-saas-pricing-models-impact-your-hotels-bottom-line)
- [Hotel software pricing 2026 (RoomMaster)](https://www.roommaster.com/blog/hotel-software-pricing-guide)
- [Embedded finance for vertical SaaS (Apideck)](https://www.apideck.com/blog/embedded-finance-vertical-saas)
- [Embedded payments for SaaS (J.P. Morgan)](https://www.jpmorgan.com/insights/payments/embedded-finance-baas/embedded-payments-saas-growth-ai)
- [Why vertical SaaS outperforms (SaaS Mag)](https://www.saasmag.com/vertical-saas-outperforming-horizontal-2026/)
- [Top hotel software in India (Hotelogix)](https://www.hotelogix.com/blog/hotel-management-software-india)
- [eZee Absolute India](https://www.ezeeabsolute.com/hotel-management-software-in-india.php)
- [Multi-tenant SaaS with Next.js + Supabase](https://www.iloveblogs.blog/guides/nextjs-supabase-multi-tenant-saas-architecture)
- [Architecting multi-tenant SaaS with Postgres RLS](https://skylinecodes.substack.com/p/how-to-architect-a-multi-tenant-saas)
