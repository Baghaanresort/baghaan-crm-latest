# Corporate Quotation & PI — Downloadable PDF

**Date:** 2026-06-09
**Status:** Approved (design)
**Area:** Corporate / Group section

## Problem

In the corporate section, staff need to send the **Quotation** (cost sheet) and the
**Proforma Invoice (PI)** to the client company as a file. Today both
`/api/print/cost-sheet` and `/api/print/pi` return a styled **HTML page**, and staff
must use the browser's print dialog → "Save as PDF". That flow is clunky for
non-tech users (pop-up blockers, the print dialog, choosing "Save as PDF") and does
not produce a clean file to attach.

**Goal:** one click → a real `.pdf` file downloads → staff attach it to email/WhatsApp.

## Constraints

- **Hosting is serverless (Vercel/Netlify).** Rules out headless Chrome
  (`@sparticuz/chromium`) as fragile/oversized. No external paid PDF service
  (cost + customer data leaving the system).
- Must work offline at render time (no runtime dependency on Google Fonts CDN).
- Reuse existing domain logic; only the visual layout is re-authored.

## Chosen approach

Add **`@react-pdf/renderer`** (pure-JS PDF engine, serverless-safe, free, crisp
selectable text). Rebuild the two layouts as PDF document components, and have the
API routes render them to a PDF buffer returned as a file download.

Alternatives rejected: hosted HTML→PDF API (recurring cost + third-party data),
`@sparticuz/chromium` (fragile on serverless).

## Scope

In scope:
- **Quotation (cost sheet) PDF** and **Proforma Invoice (PI) PDF** download.
- Keep the existing on-screen HTML **"View"** preview (HTML routes stay).

Out of scope:
- Guest voucher and other print views (`buildVoucherHTML`) — untouched.
- Any email/WhatsApp sending — download only.
- Changes to server actions, permissions, data model.

## Design

### Components / files

- `src/lib/pdf/fonts/` — bundled TTFs: Lora (400/500/600) + Cormorant Garamond
  (500/600/700). Committed to the repo so rendering is deterministic and offline.
- `src/lib/pdf/registerFonts.ts` — registers the fonts with `Font.register` once.
- `src/lib/pdf/theme.ts` — shared `StyleSheet` tokens (emerald `#064e3b`, amber
  `#d97706`/`#fef3c7`, stone text), so both documents share branding.
- `src/lib/pdf/CostSheetPdf.tsx` — `<Document>` for the quotation. Mirrors
  `buildCostSheetHTML`: centered Baghaan header, event meta grid, day-grouped line
  item table with per-day subtotals + multi-day section, grand-total box with amount
  in words, Notes / Inclusions / Terms, version + prepared-on footer.
- `src/lib/pdf/ProformaInvoicePdf.tsx` — `<Document>` for the PI. Mirrors
  `buildPIHTML`: header, Billed-To / PI-number meta row, line item table with
  GRAND TOTAL + words row, Payment Terms box (advance/balance), Bank Details box,
  terms, signature block, e-invoice footnote. Uses `BillingEntity`.

Reused as-is: `numberToIndianWords`, `fmtDate`, `datesInRange` (from
`src/lib/utils/print.ts` or `date.ts`), `BILLING_ENTITIES`, the `Booking` /
`ProformaInvoice` / `CostSheet` domain types, and the existing line-item
day-grouping logic.

### Routes / data flow

Add download routes (siblings of the existing HTML ones), each following the same
guard already in place — `supabase.auth.getUser()` → 401 if absent; fetch booking by
`bookingId` → 404 if missing; `dbToBooking`:

- `GET /api/pdf/cost-sheet?bookingId=…`
- `GET /api/pdf/pi?bookingId=…` (also guards `booking.proformaInvoice` like today)

Each route builds the PDF component, calls `renderToBuffer(<Doc …/>)`, and returns:

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="<name>.pdf"
Cache-Control: private, no-cache
```

Filenames:
- Quotation: `Quotation-<companySlug>-<confirmationNumber>.pdf`
- PI: `Proforma-Invoice-<piNumber>.pdf`

(`companySlug` = company name, non-alphanumerics → `-`, trimmed.)

The existing `/api/print/cost-sheet` and `/api/print/pi` HTML routes remain for
"View".

### UI changes

`CorporateClient.tsx` (table ⋯ menu) and `CorporateDetailClient.tsx` (Cost Sheet
card + Documents rows):

- Relabel the PDF actions to **"Download Quotation (PDF)"** /
  **"Download Proforma Invoice (PDF)"**, pointing at the new `/api/pdf/...` routes.
- Trigger a plain navigation/anchor to the route (the `attachment` header makes the
  browser download rather than open a new tab + print). Replaces the current
  `window.open(...).print()` helper for these two actions.
- Keep **"View"** wired to the existing HTML routes / preview modal.

### Error handling

- Route returns its existing 400/401/404 text responses before rendering.
- If `renderToBuffer` throws, log `[pdf:cost-sheet]` / `[pdf:pi]` server-side and
  return `500` with a short message; the UI surfaces a sonner error toast (download
  click can detect non-PDF response).

### Testing / verification

- No automated test suite in repo; `npm run build` is the typecheck gate and must
  pass clean.
- Manual: build a cost sheet + generate a PI on a sample booking, click each
  Download, confirm a valid branded `.pdf` opens in a viewer and matches the HTML
  view closely; confirm 401 when logged out and 404 for a bad id.

## Accepted trade-off

The PDF is a faithful **rebuild** of the HTML, not a screenshot, so it matches
branding closely but may differ by a few pixels from the current print view. In
return: a clean, reliable, free, one-click download with no external dependencies.
