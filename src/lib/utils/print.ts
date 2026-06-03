import type { Booking } from '@/lib/types/booking';
import type { ProformaInvoice } from '@/lib/types/booking';
import type { BillingEntity } from '@/lib/constants/billing';
import { fmtDate, datesInRange } from '@/lib/utils/date';
import { getRoomCategory } from '@/lib/constants/rooms';
import { numberToIndianWords } from '@/lib/utils/currency';

// ---------- Voucher HTML ----------
export function buildVoucherHTML(b: Booking): string {
  const roomGroups: Record<string, number> = {};
  (b.rooms || []).forEach((r) => {
    const cat = getRoomCategory(r);
    roomGroups[cat] = (roomGroups[cat] ?? 0) + 1;
  });
  const roomsLine = Object.entries(roomGroups)
    .map(([cat, ct]) => `${String(ct).padStart(2, '0')} ${cat}`)
    .join(', ');
  const balance = Math.max(0, (b.totalAmount || 0) - (b.advancePaid || 0));
  const inclusionsHTML = (b.inclusions || '')
    .split('\n')
    .filter(Boolean)
    .map((l) => `<li>▪ ${l}</li>`)
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Voucher ${b.confirmationNumber}</title>
  <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Cormorant+Garamond:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Lora', Georgia, serif; font-size: 12px; line-height: 1.5; color: #1c1917; padding: 30px; max-width: 750px; margin: 0 auto; }
    .header { text-align: center; padding-bottom: 16px; border-bottom: 2px solid #d97706; margin-bottom: 20px; }
    .header h1 { font-family: 'Cormorant Garamond', serif; font-weight: 600; font-size: 32px; letter-spacing: 0.25em; color: #064e3b; margin: 0; }
    .header .sub { font-size: 10px; letter-spacing: 0.4em; color: #b45309; margin-top: 4px; }
    .header p { font-size: 10px; color: #57534e; margin: 4px 0 0; }
    h3 { background: #064e3b; color: #fef3c7; padding: 6px 12px; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; margin: 16px 0 0; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    td { vertical-align: top; padding: 8px 12px; border-bottom: 1px solid #e7e5e4; font-size: 12px; }
    td.k { background: #f5f5f4; width: 33%; font-weight: 500; color: #44403c; }
    ul { margin: 0; padding-left: 0; list-style: none; }
    ul li { padding: 1px 0; font-size: 11px; }
    .closing { text-align: center; font-family: 'Cormorant Garamond', serif; font-size: 16px; color: #065f46; font-style: italic; margin: 24px 0; }
    .footer { font-size: 10px; color: #a8a29e; padding-top: 10px; border-top: 1px solid #e7e5e4; display: flex; justify-content: space-between; }
    .hold-banner { background: #fef3c7; border: 2px solid #f59e0b; color: #78350f; padding: 10px 14px; margin-bottom: 16px; text-align: center; font-size: 11px; letter-spacing: 0.1em; }
    @media print { body { padding: 16px; } @page { margin: 12mm; } }
  </style></head><body>
  ${b.status === 'hold' ? `<div class="hold-banner"><strong>PROVISIONAL HOLD VOUCHER</strong> — Rooms blocked pending payment${b.holdExpiresAt ? `. Confirm by ${fmtDate(b.holdExpiresAt)}` : ''}.</div>` : ''}
  <div class="header">
    <h1>BAGHAAN</h1>
    <div class="sub">ORCHARD · RETREAT</div>
    <p>Village - Kachrot, Garhmukteshwar, Uttar Pradesh</p>
    <p>Telephone: 07599053402, 09410083460</p>
  </div>
  <p>Dear Guest,</p>
  <p>Thank you for choosing Baghaan Orchard Retreat. It is our pleasure to confirm your reservation as follows.</p>

  <table>
    <tr><td class="k">Confirmation Number</td><td>${b.confirmationNumber}</td></tr>
    <tr><td class="k">Arrival Date</td><td>${fmtDate(b.arrival)}</td></tr>
    <tr><td class="k">Departure Date</td><td>${fmtDate(b.departure)}</td></tr>
    <tr><td class="k">Number of Nights</td><td>${b.nights} ${b.nights === 1 ? 'night' : 'nights'}</td></tr>
    <tr><td class="k">No. Of Adults / Child</td><td>${b.adults} ${b.adults === 1 ? 'Adult' : 'Adults'}${b.children > 0 ? ` + ${b.children} ${b.children === 1 ? 'Child' : 'Children'} of upto 12 Yrs` : ''}</td></tr>
    ${b.rateBreakdown ? `<tr><td class="k">Payment Breakup</td><td>${b.rateBreakdown}</td></tr>` : ''}
  </table>

  <h3>Guest Details</h3>
  <table>
    <tr><td class="k">Contact Name</td><td>${b.guestName}</td></tr>
    <tr><td class="k">Contact Number</td><td>${b.contactNumber}</td></tr>
    ${b.email ? `<tr><td class="k">Email</td><td>${b.email}</td></tr>` : ''}
    ${b.companyName ? `<tr><td class="k">Company</td><td>${b.companyName}</td></tr>` : ''}
    ${b.gstNumber ? `<tr><td class="k">GST Number</td><td>${b.gstNumber}</td></tr>` : ''}
  </table>

  <h3>Rate Information</h3>
  <table>
    <tr><td class="k">Number of Rooms / Cottages</td><td>${roomsLine}</td></tr>
    <tr><td class="k">Package Cost</td><td>Rs. ${Number(b.totalAmount).toLocaleString('en-IN')}/-</td></tr>
    ${b.remarks ? `<tr><td class="k">Remark</td><td>${b.remarks}</td></tr>` : ''}
    <tr><td class="k">Inclusions</td><td><ul>${inclusionsHTML}</ul></td></tr>
  </table>

  <h3>Payment and Cancellation Details</h3>
  <table>
    <tr><td class="k">Advance Paid</td><td>Rs. ${Number(b.advancePaid || 0).toLocaleString('en-IN')}/-</td></tr>
    <tr><td class="k">Balance Payable</td><td><strong>PLEASE COLLECT DIRECT PAYMENT OF RS. ${balance.toLocaleString('en-IN')}/-</strong> FROM THE GUEST AT THE TIME OF CHECK IN & ALL OTHER EXTRAS DIRECTLY FROM THE GUEST AT CHECK OUT</td></tr>
    <tr><td class="k">Cancellation Policy</td><td><ul>
      <li>• Less than 15 days before the arrival date - no refund of total booking amount</li>
      <li>• Less than 20 days before the arrival date - Advance payment will be adjusting in future booking except long weekends</li>
      <li>• No refund in case of road block, accident, no show, medical emergency etc.</li>
    </ul></td></tr>
    <tr><td class="k">Child / Extra Adult Charges</td><td><ul>
      <li>Children up to 7 years – complimentary stay without extra bed (max 2 children per room)</li>
      <li>Children 7–12 years: Rs. 2000 per night inclusive of extra bed and meals</li>
      <li>Extra Adult 12 years & above: Rs. 3000 per night inclusive of extra bed and meals</li>
    </ul></td></tr>
  </table>

  <h3>Other Details</h3>
  <p style="font-size: 11px; margin-top: 8px;">
    Check In Time - 2 pm / Check Out Time - 11 am / Early check-in and late check-out subject to availability / Multi-Cuisine Restaurant / Indoor Children's Play Area / Any services not used cannot be exchanged or redeemed / Outside Food and Beverages are Not Allowed / Accommodation for Drivers and Maid available at the resort on extra payment / Internet connectivity is erratic / Credit Cards accepted / Valid Photo ID cards required to be submitted.
  </p>
  <p style="font-size: 11px;"><strong>Meal Timings:</strong> Breakfast 0800–1000 hrs, Lunch 1300–1500 hrs, Dinner 2000–2200 hrs.</p>
  ${b.specialRequests ? `<p style="font-size: 11px;"><strong>Special Requests:</strong> ${b.specialRequests}</p>` : ''}

  <p class="closing">Have a Happy Holiday!</p>

  <div class="footer">
    <span>Booked by: ${b.createdBy || ''}</span>
    <span>Generated: ${fmtDate(new Date())}</span>
  </div>
  </body></html>`;
}

// ---------- Cost Sheet HTML ----------
interface CostSheetHTMLArgs {
  booking: Booking;
  items: Array<{
    day?: string;
    dayLabel?: string;
    particular: string;
    rate: number;
    qty: number;
    units: number;
    _id?: string;
    category?: string;
  }>;
  grandTotal: number;
  byDay: Record<string, number>;
  notes: string;
  inclusions: string[];
  terms: string;
}

export function buildCostSheetHTML({
  booking: b,
  items,
  grandTotal,
  byDay,
  notes,
  inclusions,
  terms,
}: CostSheetHTMLArgs): string {
  const stayDays = datesInRange(b.arrival, b.departure);
  const itemsByDay: Record<string, typeof items> = {};
  items.forEach((li) => {
    const k = li.day || 'multi';
    if (!itemsByDay[k]) itemsByDay[k] = [];
    itemsByDay[k]!.push(li);
  });

  let daySections = '';
  stayDays.forEach((day, idx) => {
    const dayItems = itemsByDay[day] ?? [];
    if (!dayItems.length) return;
    const subtotal = byDay[day] ?? 0;
    daySections += `<tr class="day-header"><td colspan="5">DAY ${idx + 1} — ${fmtDate(day)}</td></tr>`;
    daySections += dayItems
      .map((li) => {
        const t = Number(li.rate ?? 0) * Number(li.qty ?? 0) * Number(li.units ?? 1);
        return `<tr><td>${li.particular}</td><td class="r">${Number(li.rate).toLocaleString('en-IN')}</td><td class="r">${li.qty}</td><td class="r">${li.units}</td><td class="r">${t.toLocaleString('en-IN')}</td></tr>`;
      })
      .join('');
    daySections += `<tr class="subtotal"><td colspan="4" class="r">Day ${idx + 1} Subtotal</td><td class="r">${subtotal.toLocaleString('en-IN')}</td></tr>`;
  });

  if ((itemsByDay['multi'] ?? []).length > 0) {
    daySections += `<tr class="day-header"><td colspan="5">MULTI-DAY / EQUIPMENT</td></tr>`;
    daySections += (itemsByDay['multi'] ?? [])
      .map((li) => {
        const t = Number(li.rate ?? 0) * Number(li.qty ?? 0) * Number(li.units ?? 1);
        return `<tr><td>${li.particular}</td><td class="r">${Number(li.rate).toLocaleString('en-IN')}</td><td class="r">${li.qty}</td><td class="r">${li.units}</td><td class="r">${t.toLocaleString('en-IN')}</td></tr>`;
      })
      .join('');
    daySections += `<tr class="subtotal"><td colspan="4" class="r">Subtotal</td><td class="r">${(byDay['multi'] ?? 0).toLocaleString('en-IN')}</td></tr>`;
  }

  const gc = b.guestCount ?? { single: 0, double: 0, triple: 0 };
  const tg =
    (Number(gc.single) || 0) + (Number(gc.double) || 0) + (Number(gc.triple) || 0);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cost Sheet — ${b.companyName}</title><link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Cormorant+Garamond:wght@500;600;700&display=swap" rel="stylesheet"><style>*{box-sizing:border-box}body{font-family:'Lora',Georgia,serif;font-size:11px;line-height:1.4;color:#1c1917;padding:25px;max-width:800px;margin:0 auto}.header{text-align:center;padding-bottom:14px;border-bottom:2px solid #d97706;margin-bottom:16px}.header h1{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:28px;letter-spacing:.25em;color:#064e3b;margin:0}.sub{font-size:9px;letter-spacing:.4em;color:#b45309}.header p{font-size:10px;color:#57534e;margin:3px 0 0}h2{font-family:'Cormorant Garamond',serif;font-size:18px;text-align:center;margin:14px 0 4px;color:#064e3b}.event-meta{text-align:center;font-size:11px;color:#57534e;margin-bottom:14px}table.lines{width:100%;border-collapse:collapse;margin-top:8px;border:1px solid #d6d3d1}table.lines th{background:#064e3b;color:#fef3c7;padding:6px 8px;font-size:10px;text-align:left;text-transform:uppercase}table.lines th.r,table.lines td.r{text-align:right}table.lines td{padding:5px 8px;font-size:10px;border-top:1px solid #e7e5e4}tr.day-header td{background:#fef3c7;color:#78350f;font-weight:600;font-size:10px;text-transform:uppercase;padding:6px 8px;border-top:2px solid #d97706}tr.subtotal td{background:#fafaf9;font-weight:500}.grand{background:#064e3b;color:#fef3c7;padding:10px 14px;margin-top:8px;display:flex;justify-content:space-between;align-items:center}.grand .label{font-size:10px;letter-spacing:.15em;text-transform:uppercase}.grand .amount{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700}.grand .words{font-size:9px;font-style:italic;color:#fde68a;margin-top:3px}.footer-section{margin-top:16px}.footer-section h3{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#064e3b;border-bottom:1px solid #d6d3d1;padding-bottom:3px;margin-bottom:6px}.footer-section p{font-size:10px;margin:4px 0;color:#44403c}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:#f5f5f4;padding:8px;margin-bottom:10px;font-size:10px}.meta-grid .lbl{font-weight:500;color:#78716c;font-size:9px;text-transform:uppercase}@media print{body{padding:14px}@page{margin:10mm}}</style></head><body>
<div class="header"><h1>BAGHAAN</h1><div class="sub">ORCHARD · RETREAT</div><p>Village - Kachrot, Garhmukteshwar, Uttar Pradesh</p><p>Corporate Office: A-20, Sector-35, Noida - 201301 · GST: 09AADCM6620L1Z8</p><p>Telephone: 07599053402, 09410083460</p></div>
<h2>Corporate / Group Cost Estimation</h2>
<div class="event-meta"><strong>${b.companyName || ''}</strong>${b.companyAddress ? ' · ' + b.companyAddress : ''}<br/>Contact: ${b.contactName || ''}${b.contactNumber ? ' · ' + b.contactNumber : ''}${b.companyGST ? ' · GST: ' + b.companyGST : ''}</div>
<div class="meta-grid"><div><div class="lbl">Check In</div>${fmtDate(b.arrival)} · 02:00 PM</div><div><div class="lbl">Check Out</div>${fmtDate(b.departure)} · 11:00 AM</div><div><div class="lbl">Nights</div>${b.nights}</div><div><div class="lbl">Total Guests</div>${tg} pax</div><div><div class="lbl">Single Share</div>${gc.single || 0} guests</div><div><div class="lbl">Double Share</div>${gc.double || 0} guests</div><div><div class="lbl">Triple Share</div>${gc.triple || 0} guests</div><div><div class="lbl">Rooms</div>${b.rooms?.length || 0}</div></div>
<table class="lines"><thead><tr><th>Particular</th><th class="r">Rate</th><th class="r">No. of Guests / Units</th><th class="r">No. of Nights / Units</th><th class="r">Total (₹)</th></tr></thead><tbody>${daySections}</tbody></table>
<div class="grand"><div><div class="label">Grand Total</div><div class="words">${numberToIndianWords(grandTotal)} rupees</div></div><div class="amount">₹${grandTotal.toLocaleString('en-IN')}</div></div>
<div class="two-col"><div class="footer-section"><h3>Notes</h3><p>${notes.split('\n').map((l) => l.trim()).filter(Boolean).join('<br/>')}</p></div><div class="footer-section"><h3>Activities Included (free)</h3><p>${inclusions.join(' · ')}</p></div></div>
<div class="footer-section"><h3>Terms &amp; Conditions</h3><p>${terms}</p></div>
<div class="footer-section" style="margin-top:20px;text-align:right;font-size:9px;color:#a8a29e;">Cost sheet version ${b.costSheet?.version || 1} · Prepared on ${fmtDate(new Date())}</div>
</body></html>`;
}

// ---------- Proforma Invoice HTML ----------
export function buildPIHTML(
  b: Booking,
  pi: ProformaInvoice,
  entity: BillingEntity
): string {
  const stayDays = datesInRange(b.arrival, b.departure);
  const ibd: Record<string, typeof pi.lineItems> = {};
  (pi.lineItems || []).forEach((li) => {
    const k = li.day || 'multi';
    if (!ibd[k]) ibd[k] = [];
    ibd[k]!.push(li);
  });

  let rows = '';
  stayDays.forEach((day) => {
    const di = ibd[day] ?? [];
    if (!di.length) return;
    rows += `<tr class="day-header"><td colspan="4">${fmtDate(day)}</td></tr>`;
    di.forEach((li) => {
      const t = Number(li.rate ?? 0) * Number(li.qty ?? 0) * Number(li.units ?? 1);
      rows += `<tr><td>${li.particular}</td><td class="r">${Number(li.rate).toLocaleString('en-IN')}</td><td class="r">${li.qty}${li.units > 1 ? ' × ' + li.units : ''}</td><td class="r">${t.toLocaleString('en-IN')}</td></tr>`;
    });
  });

  if ((ibd['multi'] ?? []).length > 0) {
    rows += `<tr class="day-header"><td colspan="4">Multi-Day / Equipment</td></tr>`;
    (ibd['multi'] ?? []).forEach((li) => {
      const t = Number(li.rate ?? 0) * Number(li.qty ?? 0) * Number(li.units ?? 1);
      rows += `<tr><td>${li.particular}</td><td class="r">${Number(li.rate).toLocaleString('en-IN')}</td><td class="r">${li.qty}${li.units > 1 ? ' × ' + li.units : ''}</td><td class="r">${t.toLocaleString('en-IN')}</td></tr>`;
    });
  }

  const balance = Math.max(0, pi.grandTotal - (pi.advanceRequired || 0));

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Proforma Invoice ${pi.piNumber}</title><link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600&family=Cormorant+Garamond:wght@500;600;700&display=swap" rel="stylesheet"><style>*{box-sizing:border-box}body{font-family:'Lora',Georgia,serif;font-size:11px;line-height:1.45;color:#1c1917;padding:25px;max-width:800px;margin:0 auto}.header{text-align:center;padding-bottom:12px;border-bottom:2px solid #d97706;margin-bottom:14px}.header h1{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:28px;letter-spacing:.25em;color:#064e3b;margin:0}.sub{font-size:9px;letter-spacing:.4em;color:#b45309}.header p{font-size:10px;color:#57534e;margin:2px 0 0}.meta-row{display:flex;justify-content:space-between;margin-bottom:12px;font-size:10px}.meta-row .lbl{font-size:9px;color:#78716c;text-transform:uppercase;letter-spacing:.05em}table.lines{width:100%;border-collapse:collapse;border:1px solid #d6d3d1;margin:8px 0}table.lines th{background:#064e3b;color:#fef3c7;padding:6px 8px;font-size:10px;text-align:left;text-transform:uppercase}table.lines th.r,table.lines td.r{text-align:right}table.lines td{padding:5px 8px;font-size:10px;border-top:1px solid #e7e5e4}tr.day-header td{background:#fef3c7;color:#78350f;font-weight:600;font-size:10px;text-transform:uppercase;padding:5px 8px;border-top:2px solid #d97706}.total-row td{background:#ecfdf5;font-weight:500;color:#065f46;border-top:2px solid #047857;font-size:11px}.words-row td{font-size:10px;font-style:italic;color:#78716c;padding:3px 8px}.payment-box{background:#fffbeb;border:2px solid #f59e0b;padding:8px 12px;margin:10px 0;font-size:10px}.payment-box h3{font-size:10px;text-transform:uppercase;color:#92400e;border-bottom:1px solid #fde68a;padding-bottom:3px;margin:0 0 5px}.payment-box table{width:100%}.payment-box td{padding:2px 0}.payment-box .r{text-align:right;font-weight:500}.bank-box{background:#fafaf9;border:1px solid #d6d3d1;padding:8px 12px;margin:8px 0;font-size:10px}.bank-box h3{font-size:10px;text-transform:uppercase;color:#064e3b;margin:0 0 5px}.bank-box td{padding:2px 0}.bank-box td:first-child{color:#78716c;width:30%}.terms{font-size:10px;color:#57534e;margin-top:8px}.signature{margin-top:30px;text-align:right;font-size:10px;color:#57534e}.signature .sig-line{border-top:1px solid #78716c;padding-top:3px;margin-top:20px;display:inline-block;padding-left:30px;padding-right:30px}.footnote{text-align:center;font-size:9px;color:#a8a29e;font-style:italic;margin-top:12px}@media print{body{padding:14px}@page{margin:10mm}}</style></head><body>
<div class="header"><h1>BAGHAAN</h1><div class="sub">ORCHARD · RETREAT</div><p>${entity.address}</p><p>Corporate Office: ${entity.corpOffice} · GST: ${entity.gst}</p><p>Telephone: ${entity.phones}</p></div>
<div class="meta-row">
  <div><div class="lbl">Billed To</div><div style="font-weight:500;margin-top:2px;">${b.companyName || ''}</div>${b.companyAddress ? `<div>${b.companyAddress}</div>` : ''} ${b.companyGST ? `<div style="color:#57534e;">GST: ${b.companyGST}</div>` : ''}<div style="color:#57534e;margin-top:3px;">Contact: ${b.contactName || ''} · ${b.contactNumber || ''}</div></div>
  <div style="text-align:right;"><div class="lbl">Proforma Invoice No.</div><div style="font-family:monospace;font-weight:500;margin-top:2px;">${pi.piNumber}</div><div style="color:#57534e;margin-top:5px;">Date: ${fmtDate(pi.generatedAt)}</div><div style="color:#57534e;">Check In: ${fmtDate(b.arrival)} · 02:00 PM</div><div style="color:#57534e;">Check Out: ${fmtDate(b.departure)} · 11:00 AM</div><div style="color:#57534e;">Nights: ${b.nights}</div></div>
</div>
<table class="lines"><thead><tr><th>Particulars</th><th class="r">Rate</th><th class="r">No. / Units</th><th class="r">Total (₹)</th></tr></thead>
<tbody>${rows}<tr class="total-row"><td colspan="3">GRAND TOTAL</td><td class="r">₹${Number(pi.grandTotal).toLocaleString('en-IN')}</td></tr><tr class="words-row"><td colspan="4">Rupees ${numberToIndianWords(pi.grandTotal)}</td></tr></tbody></table>
<div class="payment-box"><h3>Payment Terms</h3><table><tr><td>Advance Required (50%)</td><td class="r">₹${Number(pi.advanceRequired).toLocaleString('en-IN')}</td></tr><tr><td>Balance (before checkout)</td><td class="r">₹${balance.toLocaleString('en-IN')}</td></tr></table><p style="margin:5px 0 0;">${pi.paymentTerms || '50% advance to confirm booking. Balance to be paid before checkout.'}</p></div>
<div class="bank-box"><h3>Bank Details</h3><table><tr><td>Payable to</td><td style="font-weight:500;">${entity.payeeName}</td></tr><tr><td>Bank</td><td>${entity.bank.name}</td></tr><tr><td>Branch</td><td>${entity.bank.branch}</td></tr><tr><td>Account Type</td><td>${entity.bank.accountType}</td></tr><tr><td>Account No.</td><td style="font-family:monospace;">${entity.bank.accountNo}</td></tr><tr><td>IFSC</td><td style="font-family:monospace;">${entity.bank.ifsc}</td></tr></table></div>
<div class="terms"><p>1. Resort not liable for any damages due to circumstances beyond its control.</p><p>2. All disputes are subject to jurisdiction of Delhi.</p><p>3. Payment to be made in favour of '${entity.payeeName}'.</p></div>
<div class="signature"><div>Generated by: ${pi.generatedBy} · ${fmtDate(pi.generatedAt)}</div><div class="sig-line">For ${entity.payeeName}</div><div style="font-style:italic;margin-top:3px;">Authorized Signatory</div></div>
<div class="footnote">**** Electronic Invoice does not require Signature ****</div>
</body></html>`;
}
