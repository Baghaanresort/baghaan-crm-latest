# Uppercase Client Documents — Design

**Date:** 2026-06-24
**Status:** Approved (design)
**Scope:** Render the client-facing generated **documents** in ALL CAPS — display only, no data mutation.

## Goal

Every generated guest/client document renders its text in uppercase, for a uniform formal
look. The change is purely visual (CSS / `textTransform`): the database, the values staff
type, and notification emails all keep their original case.

## In scope (the four documents — both HTML print view and PDF where applicable)

- **Voucher** — HTML (`buildVoucherHTML`, used by `/api/print/voucher` and the guest
  `/api/voucher/view`) and PDF (`VoucherPdf`, `/api/pdf/voucher`).
- **Cost Sheet** — HTML (`buildCostSheetHTML`, `/api/print/cost-sheet`) and PDF
  (`CostSheetPdf`, `/api/pdf/cost-sheet`).
- **Proforma Invoice** — HTML (`buildPIHTML`, `/api/print/pi`) and PDF
  (`ProformaInvoicePdf`, `/api/pdf/pi`).
- **Menu** — HTML (`/api/print/menu`).

## Out of scope

- Notification emails (`voucherEmail`, `paymentRequestEmail`, `paymentReceiptEmail`,
  `refundNoticeEmail`) — keep normal case.
- The CRM app UI (tables, modals, forms) — unchanged.
- Stored data / DB / mappers — never mutated.

## Approach: container-level display transform

**PDFs:** add `textTransform: 'uppercase'` to the shared `page` style in
`src/lib/pdf/theme.ts`. All three PDFs use `styles.page` as their `<Page>` style, so one
change covers `VoucherPdf`, `CostSheetPdf`, and `ProformaInvoicePdf`. (`@react-pdf` treats
`textTransform` as an inheritable text property, so a `<Page>`-level value applies to every
`<Text>`. If a version quirk prevents cascade, fall back to adding `textTransform: 'uppercase'`
to the shared text style(s) instead — identical visual result. This is settled during
implementation by rendering a PDF and reading it back.)

**HTML print views:** add `text-transform: uppercase;` to the `body` rule in the embedded
`<style>` of each builder — `buildVoucherHTML`, `buildCostSheetHTML`, `buildPIHTML`
(`src/lib/utils/print.ts`) — and in the menu route's HTML (`src/app/api/print/menu/route.ts`).

Rejected: uppercasing the data strings before render — mutates content, risks leaking into
emails/exports, and is far more invasive. CSS/`textTransform` is non-destructive and localized.

## Behaviour notes

- Numbers, dates, ₹ amounts, and confirmation numbers (e.g. `BOR/HO/26/DL9405`) are
  unaffected by uppercasing (no lowercase letters).
- Email addresses shown in a document render in caps too (explicitly chosen). The stored and
  emailed address is unchanged — this is display-only.
- The guest online voucher (`/api/voucher/view`) uses `buildVoucherHTML`, so it inherits the
  uppercase body; the injected "Download PDF" control sits in that body and will also show in
  caps — acceptable.

## Verification

- `npm run build` — typecheck gate.
- Render a voucher PDF (`renderVoucher`) to a file and read it back: confirm body text is
  uppercase AND the BAGHAAN header/brand still renders correctly.
- Fetch one HTML print view and confirm the `body { ... text-transform: uppercase ... }` rule
  is present in the markup.
- Manual: open each print view / PDF and eyeball the all-caps result.
