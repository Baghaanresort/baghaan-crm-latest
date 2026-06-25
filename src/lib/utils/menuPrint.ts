import type { MenuItem } from '@/lib/types/menu';
import { MENU_CATEGORIES } from '@/lib/constants/menu';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function vegDot(t: MenuItem['vegType']): string {
  if (t === 'veg') return '<span class="veg veg-g" title="Veg"></span>';
  if (t === 'non_veg') return '<span class="veg veg-r" title="Non-veg"></span>';
  return '';
}

// Guest-facing standard menu for corporate clients. Active items only, grouped
// by section (known categories first, then any custom ones).
export function buildMenuHTML(items: MenuItem[]): string {
  const active = items.filter(i => i.isActive);

  const known = MENU_CATEGORIES as readonly string[];
  const cats = Array.from(new Set(active.map(i => i.category)))
    .sort((a, b) => {
      const ia = known.indexOf(a), ib = known.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

  const sections = cats.map(cat => {
    const rows = active.filter(i => i.category === cat).map(i => `
      <tr>
        <td class="name">${vegDot(i.vegType)}${esc(i.name)}${i.description ? `<div class="desc">${esc(i.description)}</div>` : ''}</td>
        <td class="price">${i.price != null ? '₹' + i.price.toLocaleString('en-IN') : ''}</td>
      </tr>`).join('');
    return `<h3>${esc(cat)}</h3><table class="items">${rows}</table>`;
  }).join('');

  const body = sections || '<p class="empty">No menu items have been added yet.</p>';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Baghaan — Menu</title>
  <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Cormorant+Garamond:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Lora', Georgia, serif; font-size: 12px; line-height: 1.5; color: #1c1917; padding: 30px; max-width: 750px; margin: 0 auto; text-transform: uppercase; }
    .header { text-align: center; padding-bottom: 16px; border-bottom: 2px solid #d97706; margin-bottom: 20px; }
    .header h1 { font-family: 'Cormorant Garamond', serif; font-weight: 600; font-size: 32px; letter-spacing: 0.25em; color: #064e3b; margin: 0; }
    .header .sub { font-size: 10px; letter-spacing: 0.4em; color: #b45309; margin-top: 4px; }
    .header p { font-size: 10px; color: #57534e; margin: 4px 0 0; }
    .title { text-align: center; font-family: 'Cormorant Garamond', serif; font-size: 22px; color: #065f46; margin: 4px 0 18px; letter-spacing: 0.08em; }
    h3 { background: #064e3b; color: #fef3c7; padding: 6px 12px; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; margin: 18px 0 0; font-weight: 500; }
    table.items { width: 100%; border-collapse: collapse; }
    table.items td { padding: 7px 12px; border-bottom: 1px solid #ececeb; vertical-align: top; }
    td.name { font-weight: 500; color: #292524; }
    td.price { text-align: right; white-space: nowrap; color: #065f46; font-weight: 500; width: 90px; }
    .desc { font-weight: 400; font-size: 11px; color: #78716c; font-style: italic; margin-top: 2px; }
    .veg { display: inline-block; width: 9px; height: 9px; border: 1.5px solid; margin-right: 7px; vertical-align: middle; }
    .veg-g { border-color: #16a34a; } .veg-g::after { content: ''; }
    .veg-r { border-color: #dc2626; }
    .veg-g { position: relative; } .veg-g { background: radial-gradient(circle, #16a34a 45%, transparent 46%); }
    .veg-r { background: radial-gradient(circle, #dc2626 45%, transparent 46%); }
    .empty { text-align: center; color: #a8a29e; font-style: italic; padding: 40px 0; }
    .footer { text-align: center; font-family: 'Cormorant Garamond', serif; font-size: 15px; color: #065f46; font-style: italic; margin-top: 26px; }
    @media print { body { padding: 16px; } @page { margin: 12mm; } }
  </style></head><body>
  <div class="header">
    <h1>BAGHAAN</h1>
    <div class="sub">ORCHARD · RETREAT</div>
    <p>Village - Kachrot, Garhmukteshwar, Uttar Pradesh · Tel: 07599053402, 09410083460</p>
  </div>
  <div class="title">Menu</div>
  ${body}
  <div class="footer">Prices inclusive of applicable taxes unless stated otherwise.</div>
  </body></html>`;
}
