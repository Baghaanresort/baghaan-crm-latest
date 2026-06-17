# Baghaan CRM → Hospitality SaaS — MASTER PLAN

**Date:** 2026-06-15 · **Status:** Top-level plan for review (no code written yet)
**Purpose:** single entry point that ties the detailed plans together. The deep specs stay
separate — this doc gives the vision, sequence, and where to read more.

> Companion docs (kept separate, not merged):
> - **Strategy & full architecture:** `2026-06-15-saas-product-architecture-and-strategy.md`
> - **Tenancy mechanics:** `2026-06-15-multi-tenant-saas-plan.md`
> - **AI automation layer:** `2026-06-15-ai-workflow-automation-plan.md`

---

## 1. The one-line vision
Turn Baghaan's resort CRM into a **multi-tenant hospitality SaaS**, wedged into the
**corporate/group + GST workflow** that Indian incumbents underserve, then defended with
**embedded payments + an AI/data moat**.

## 2. Why this can win (from market research)
- Incumbents (Cloudbeds, Mews, Hostaway, Hotelogix, eZee, Djubo) sell an integration **hub**;
  software alone is a commodity.
- The real, defensible business = **vertical SaaS + embedded payments (2–5× revenue per
  customer) + accumulating operational data/AI**. Switching costs + network effects compound.
- Our wedge: deep enquiry→quote→PI→advance→booking + GST/voucher workflows, where cheap PMSs
  are weak. → *Detail in the strategy doc, §1–2 and §5.*

## 3. The three workstreams
| # | Workstream | What it delivers | Detailed in |
| --- | --- | --- | --- |
| A | **Tenancy foundation** | RLS isolation, `resorts/memberships/rooms`, per-tenant data/counters/branding | `multi-tenant-saas-plan.md` |
| B | **SaaS platform** | Billing + embedded payments, self-serve onboarding, integrations hub, observability, compliance | `saas-product-architecture-and-strategy.md` (§3–4) |
| C | **AI layer** | Enquiry capture, follow-up, quoting, ID OCR, concierge — human-approved | `ai-workflow-automation-plan.md` |

## 4. The build sequence (this is the plan)
Order matters — each phase is shippable and leaves Baghaan working.

| Phase | Theme | Depends on | Outcome |
| --- | --- | --- | --- |
| **0** | Tenancy foundation | — | RLS isolation; Baghaan = tenant #1; no UX change |
| **1** | App scoping + super-admin onboarding | 0 | Onboard tenant #2 by hand; per-tenant rooms/rates/branding |
| **2** | Billing + embedded payments (Razorpay) | 1 | Subscriptions + transaction payments; suspend = read-only → **the moat starts** |
| **3** | Self-serve signup + plan limits | 2 | Resorts onboard themselves |
| **4** | AI layer (capture + follow-up first) | 1 | Conversion lift; data moat begins |
| **5** | Integrations hub (channel/OTA + accounting) | 2 | Becomes the operational hub |
| **6** | Scale & enterprise | as needed | Read replicas, multi-property, SSO, analytics |

## 5. Tech direction (summary — full list in strategy doc §3)
Keep the proven core (**Next.js 16 + Supabase + RLS + Tailwind + Zod**); add **Razorpay**
(billing + payments), **queues** (Supabase Queues/Inngest), **Resend** (email),
**WhatsApp Business API**, **Claude** (Haiku/Sonnet/Opus, tool-use + Zod-validated),
**Sentry + PostHog**. Host on **Vercel + Supabase (Mumbai region)**.

## 6. Moat & money (summary)
- **Pricing:** tiered per-property subscription (not per-seat) + **payments take-rate** + add-ons.
- **Moat:** payments lock-in → operational dependence → data/AI → integration network effects.
- **GTM:** land on the corporate/group + GST wedge; expand account into payments → channel → AI.

## 7. Top risks (full table in strategy doc §7)
Don't fight Cloudbeds head-on (win the wedge) · RLS misconfig = leak (RLS-as-code + CI tests) ·
payments/compliance complexity (use Razorpay managed flows, phase it) · don't scale prematurely.

## 8. Recommendation
**Do Phase 0 in full and stop** to prove isolation safely against live Baghaan. Then proceed
0 → 1 → 2 → 3 → 4 → 5. Build payments + the data/AI moat deliberately — that, not the CRM
features, is the defensible business.

## 9. Backend / tech-stack decision (settled)
**Keep the integrated Next.js 16 + Supabase + RLS stack as the backbone — do NOT split to a
FastAPI (or other) backend.** For an I/O-bound CRUD CRM the web framework is not the bottleneck;
Postgres (indexes, pooling, caching, queues) is. A FastAPI rewrite would add a second
language/codebase, lose Server Actions + native RLS auth, and buy no real scalability.

- **Python/FastAPI only as an optional sidecar** behind a queue, and only when a genuine
  ML/data workload appears (≈Phase 6) — never on the critical request path.
- **AI layer stays in TypeScript** (Anthropic SDK is first-class in TS) — Python not required.
- **If we ever outgrow Server Actions:** move to a **NestJS (Node/TS)** API — separation without
  a second language. Not needed at current scale.
- **Real scalability levers (do these, not framework swaps):** connection pooling (pgBouncer),
  indexes + kill N+1s, read replicas, CDN/per-request caching, queues for async work.

---
*All planning only. No migrations or code to be written until explicitly requested.*
