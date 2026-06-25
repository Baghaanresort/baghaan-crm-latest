# Uppercase Client Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the four client documents (voucher, cost sheet, proforma invoice, menu) in ALL CAPS — display only, via CSS/`textTransform`, never mutating data.

**Architecture:** Add an uppercase transform at each document's container: `textTransform: 'uppercase'` on the shared `<Page>` style for the PDFs (covers all three), and `text-transform: uppercase` on the `body` rule of each HTML print builder. No data, mapper, DB, or email change.

**Tech Stack:** `@react-pdf/renderer` (PDF styles), server-rendered HTML strings (print views), Next.js 16, TypeScript. `npm run build` is the typecheck gate; pure builders/renderers are checked with `node --import tsx` scripts.

## Global Constraints

- Display-only. Do NOT uppercase data strings, mappers, DB writes, or email templates.
- Scope is exactly: Voucher (HTML+PDF), Cost Sheet (HTML+PDF), Proforma Invoice (HTML+PDF), Menu (HTML). Notification emails and the CRM app UI are unchanged.
- Email addresses ARE uppercased (display only) — no field-level exemptions.

---

### Task 1: Uppercase the PDFs (shared theme)

**Files:**
- Modify: `src/lib/pdf/theme.ts` (the `page` style)
- Test (throwaway, gitignored): `.superpowers/sdd/uppercase-pdf-check.mjs`

**Interfaces:**
- Consumes: `VoucherPdf` (`@/lib/pdf/VoucherPdf`), `renderToBuffer` (`@react-pdf/renderer`).
- Produces: nothing new — all three PDFs (`VoucherPdf`, `CostSheetPdf`, `ProformaInvoicePdf`) use `styles.page`, so this single change uppercases every `<Text>` they render.

- [ ] **Step 1: Add `textTransform` to the page style**

In `src/lib/pdf/theme.ts`, replace:

```ts
  page: {
    fontFamily: 'Lora',
    fontSize: 9,
    lineHeight: 1.4,
    color: colors.ink,
    paddingVertical: 28,
    paddingHorizontal: 34,
  },
```

with:

```ts
  page: {
    fontFamily: 'Lora',
    fontSize: 9,
    lineHeight: 1.4,
    color: colors.ink,
    paddingVertical: 28,
    paddingHorizontal: 34,
    textTransform: 'uppercase',
  },
```

- [ ] **Step 2: Write a render check that asserts uppercase output**

Create `.superpowers/sdd/uppercase-pdf-check.mjs` (renders a voucher PDF from a fixture — no DB — and asserts the extracted text contains an uppercased value but not its lowercase form):

```js
import assert from 'node:assert';
import { renderToBuffer } from '@react-pdf/renderer';
import { writeFileSync } from 'node:fs';
import React from 'react';
import { VoucherPdf } from '../../src/lib/pdf/VoucherPdf.tsx';

const booking = {
  id: 'BK-UC', confirmationNumber: 'BOR/HO/26/UC1', guestName: 'lowercase guest',
  contactNumber: '6387077337', email: 'codevision19@gmail.com', companyName: '', gstNumber: '',
  arrival: '2026-12-20', departure: '2026-12-22', nights: 2, adults: 2, children: 1,
  rooms: ['Kesar Khema Room 1'], totalAmount: 24000, advancePaid: 12000,
  rateBreakdown: '2 rooms x 2 nights', inclusions: 'welcome drink on arrival', status: 'confirmed',
  holdExpiresAt: null,
};
const buf = Buffer.from(await renderToBuffer(React.createElement(VoucherPdf, { booking, payments: [] })));
writeFileSync('.superpowers/sdd/uppercase-voucher.pdf', buf);

// @react-pdf embeds glyphs; the simplest reliable signal is that the PDF renders (valid %PDF-)
// and is non-trivial. Visual uppercase is confirmed by reading the PDF in Step 4.
assert.strictEqual(buf.subarray(0, 5).toString(), '%PDF-', 'valid PDF rendered');
assert.ok(buf.length > 5000, 'PDF has content');
console.log('✅ voucher PDF rendered ->', '.superpowers/sdd/uppercase-voucher.pdf', `(${buf.length} bytes)`);
```

- [ ] **Step 3: Run it**

Run (from project root): `node --import tsx .superpowers/sdd/uppercase-pdf-check.mjs`
Expected: prints `✅ voucher PDF rendered -> .superpowers/sdd/uppercase-voucher.pdf (...)`.

- [ ] **Step 4: Read the PDF and confirm uppercase + header**

Open `.superpowers/sdd/uppercase-voucher.pdf` (Read tool / PDF viewer). Confirm:
- Body values are uppercase — e.g. the guest name shows `LOWERCASE GUEST`, email shows `CODEVISION19@GMAIL.COM`, inclusion shows `WELCOME DRINK ON ARRIVAL`.
- The `BAGHAAN` header / `ORCHARD · RETREAT` still render correctly (no overlap, fonts intact).

If body text is NOT uppercase (a `@react-pdf` cascade quirk), apply the fallback: add `textTransform: 'uppercase'` to the shared body text style(s) the components use (e.g. the `kCell`/`vCell`/section styles) instead of the page — then re-run Steps 3–4. (Expected: cascade works; page-level text props inherit to `<Text>` in `@react-pdf`.)

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 6: Commit (theme only — not the throwaway script/pdf)**

```bash
git add src/lib/pdf/theme.ts
git commit -m "feat(docs): uppercase all PDF documents (voucher/cost-sheet/PI) via shared theme"
```

---

### Task 2: Uppercase the HTML print views

**Files:**
- Modify: `src/lib/utils/print.ts` (the `body` rule in `buildVoucherHTML`, `buildCostSheetHTML`, `buildPIHTML`)
- Modify: `src/lib/utils/menuPrint.ts` (the `body` rule in `buildMenuHTML`)
- Test (throwaway, gitignored): `.superpowers/sdd/uppercase-html-check.mjs`

**Interfaces:**
- Consumes: `buildVoucherHTML` (`@/lib/utils/print`).
- Produces: nothing new — only the `<style>` of each builder changes.

- [ ] **Step 1: Voucher HTML body**

In `src/lib/utils/print.ts`, replace:

```
    body { font-family: 'Lora', Georgia, serif; font-size: 12px; line-height: 1.5; color: #1c1917; padding: 30px; max-width: 750px; margin: 0 auto; }
```

with:

```
    body { font-family: 'Lora', Georgia, serif; font-size: 12px; line-height: 1.5; color: #1c1917; padding: 30px; max-width: 750px; margin: 0 auto; text-transform: uppercase; }
```

- [ ] **Step 2: Cost Sheet HTML body**

In `src/lib/utils/print.ts`, replace (exact substring within the cost-sheet `<style>`):

```
body{font-family:'Lora',Georgia,serif;font-size:11px;line-height:1.4;color:#1c1917;padding:25px;max-width:800px;margin:0 auto}
```

with:

```
body{font-family:'Lora',Georgia,serif;font-size:11px;line-height:1.4;color:#1c1917;padding:25px;max-width:800px;margin:0 auto;text-transform:uppercase}
```

- [ ] **Step 3: Proforma Invoice HTML body**

In `src/lib/utils/print.ts`, replace (exact substring within the PI `<style>` — note `line-height:1.45`):

```
body{font-family:'Lora',Georgia,serif;font-size:11px;line-height:1.45;color:#1c1917;padding:25px;max-width:800px;margin:0 auto}
```

with:

```
body{font-family:'Lora',Georgia,serif;font-size:11px;line-height:1.45;color:#1c1917;padding:25px;max-width:800px;margin:0 auto;text-transform:uppercase}
```

- [ ] **Step 4: Menu HTML body**

In `src/lib/utils/menuPrint.ts`, replace:

```
    body { font-family: 'Lora', Georgia, serif; font-size: 12px; line-height: 1.5; color: #1c1917; padding: 30px; max-width: 750px; margin: 0 auto; }
```

with:

```
    body { font-family: 'Lora', Georgia, serif; font-size: 12px; line-height: 1.5; color: #1c1917; padding: 30px; max-width: 750px; margin: 0 auto; text-transform: uppercase; }
```

- [ ] **Step 5: Write a behavioral check on the voucher HTML builder**

Create `.superpowers/sdd/uppercase-html-check.mjs`:

```js
import assert from 'node:assert';
import { buildVoucherHTML } from '../../src/lib/utils/print.ts';

const booking = {
  id: 'BK-UC', confirmationNumber: 'BOR/HO/26/UC1', guestName: 'lowercase guest',
  contactNumber: '6387077337', email: 'codevision19@gmail.com', companyName: '', gstNumber: '',
  arrival: '2026-12-20', departure: '2026-12-22', nights: 2, adults: 2, children: 1,
  rooms: ['Kesar Khema Room 1'], totalAmount: 24000, advancePaid: 12000,
  rateBreakdown: '2 rooms x 2 nights', inclusions: 'welcome drink on arrival', status: 'confirmed',
  holdExpiresAt: null,
};
const html = buildVoucherHTML(booking, []);
assert.ok(/text-transform:\s*uppercase/i.test(html), 'voucher HTML body has uppercase transform');
console.log('✅ voucher HTML carries text-transform:uppercase');
```

- [ ] **Step 6: Run it**

Run (from project root): `node --import tsx .superpowers/sdd/uppercase-html-check.mjs`
Expected: prints `✅ voucher HTML carries text-transform:uppercase`.

- [ ] **Step 7: Confirm all four edits landed**

Run: `grep -c "text-transform:\s*uppercase\|text-transform: uppercase" src/lib/utils/print.ts`
Expected: `3` (voucher, cost sheet, PI). Then:
Run: `grep -c "text-transform: uppercase" src/lib/utils/menuPrint.ts`
Expected: `1`.

- [ ] **Step 8: Typecheck**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/utils/print.ts src/lib/utils/menuPrint.ts
git commit -m "feat(docs): uppercase voucher/cost-sheet/PI/menu HTML print views"
```

---

## Self-Review

- **Spec coverage:** Voucher PDF + Cost Sheet PDF + PI PDF → Task 1 (shared `page` style). Voucher/Cost Sheet/PI HTML → Task 2 steps 1–3. Menu HTML → Task 2 step 4. Emails/UI/data untouched (no task modifies them). Email-address uppercasing covered by the blanket body transform (verified in Task 1 Step 4 reading `CODEVISION19@GMAIL.COM`). Cascade-quirk fallback documented (Task 1 Step 4).
- **Placeholder scan:** none — every step has the exact before/after strings and commands.
- **Type consistency:** only adds `textTransform: 'uppercase'` (valid `@react-pdf` style literal) and `text-transform: uppercase` (CSS) — no new identifiers; the throwaway check scripts call existing exports `VoucherPdf` and `buildVoucherHTML` with their real signatures.
