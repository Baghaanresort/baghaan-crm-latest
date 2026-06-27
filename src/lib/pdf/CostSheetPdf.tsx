import { Document, Page, View, Text } from '@react-pdf/renderer';
import type { Booking, LineItem } from '@/lib/types/booking';
import { fmtDate, datesInRange } from '@/lib/utils/date';
import { numberToIndianWords } from '@/lib/utils/currency';
import { registerPdfFonts } from './registerFonts';
import { styles, colors } from './theme';
import { PAID_ACTIVITIES } from '@/lib/constants/activities';
import { sharingGuests, totalGuests, totalRooms } from '@/lib/utils/occupancy';

registerPdfFonts();

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const num = (n: number) => (Number(n) || 0).toLocaleString('en-IN');

// Column widths for the 5-column cost-sheet table.
const col = {
  particular: { flexGrow: 3, flexBasis: 0 },
  rate: { flexGrow: 1.3, flexBasis: 0 },
  qty: { flexGrow: 1.6, flexBasis: 0 },
  units: { flexGrow: 1.6, flexBasis: 0 },
  total: { flexGrow: 1.6, flexBasis: 0 },
} as const;

export interface CostSheetPdfProps {
  booking: Booking;
  items: LineItem[];
  grandTotal: number;
  byDay: Record<string, number>;
  notes: string;
  inclusions: string[];
  terms: string;
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '25%', paddingVertical: 3, paddingHorizontal: 4 }}>
      <Text style={{ fontSize: 6.5, textTransform: 'uppercase', color: colors.muted2, fontWeight: 500 }}>{label}</Text>
      <Text style={{ fontSize: 8.5, marginTop: 1 }}>{value}</Text>
    </View>
  );
}

function ItemRow({ li }: { li: LineItem }) {
  const total = (Number(li.rate) || 0) * (Number(li.qty) || 0);
  return (
    <View style={styles.row} wrap={false}>
      <Text style={[styles.td, col.particular]}>{li.particular}</Text>
      <Text style={[styles.td, col.rate, styles.right]}>{num(li.rate)}</Text>
      <Text style={[styles.td, col.qty, styles.right]}>{li.qty}</Text>
      <Text style={[styles.td, col.units, styles.right]}>{li.units}</Text>
      <Text style={[styles.td, col.total, styles.right]}>{num(total)}</Text>
    </View>
  );
}

export function CostSheetPdf({ booking: b, items, grandTotal, byDay, notes, inclusions, terms }: CostSheetPdfProps) {
  const stayDays = datesInRange(b.arrival, b.departure);
  const itemsByDay: Record<string, LineItem[]> = {};
  items.forEach(li => {
    const k = li.day || 'multi';
    (itemsByDay[k] ??= []).push(li);
  });

  const gc = b.guestCount ?? { single: 0, double: 0, triple: 0 };
  const sg = sharingGuests(gc); // derived head-count per sharing basis
  const totalPax = totalGuests(gc); // total pax (rooms × occupancy)
  const totalRoomCount = totalRooms(gc); // total rooms across all bases
  const multi = itemsByDay['multi'] ?? [];

  return (
    <Document title={`Cost Sheet — ${b.companyName ?? ''}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>BAGHAAN</Text>
          <Text style={styles.brandSub}>ORCHARD · RETREAT</Text>
          <Text style={styles.brandLine}>Village - Kachrot, Garhmukteshwar, Uttar Pradesh</Text>
          <Text style={styles.brandLine}>Corporate Office: A-20, Sector-35, Noida - 201301 · GST: 09AADCM6620L1Z8</Text>
          <Text style={styles.brandLine}>Telephone: 07599053402, 09410083460</Text>
        </View>

        <Text style={styles.docTitle}>Corporate / Group Cost Estimation</Text>
        <Text style={{ textAlign: 'center', fontSize: 8.5, color: colors.muted, marginBottom: 10 }}>
          {[b.companyName, b.companyAddress].filter(Boolean).join(' · ')}
          {(b.contactName || b.contactNumber) ? `\nContact: ${[b.contactName, b.contactNumber].filter(Boolean).join(' · ')}` : ''}
          {b.companyGST ? ` · GST: ${b.companyGST}` : ''}
        </Text>

        {/* Stay meta grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surface, paddingVertical: 4, paddingHorizontal: 4, marginBottom: 8 }}>
          <MetaCell label="Check In" value={`${fmtDate(b.arrival)} · 02:00 PM`} />
          <MetaCell label="Check Out" value={`${fmtDate(b.departure)} · 11:00 AM`} />
          <MetaCell label="Nights" value={String(b.nights)} />
          <MetaCell label="Total Guests" value={`${totalPax} pax`} />
          <MetaCell label="Single Share" value={`${gc.single || 0} rooms · ${sg.single} pax`} />
          <MetaCell label="Double Share" value={`${gc.double || 0} rooms · ${sg.double} pax`} />
          <MetaCell label="Triple Share" value={`${gc.triple || 0} rooms · ${sg.triple} pax`} />
          <MetaCell label="Rooms" value={String(totalRoomCount)} />
        </View>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.thead} fixed>
            <Text style={[styles.th, col.particular]}>Particular</Text>
            <Text style={[styles.th, col.rate, styles.right]}>Rate</Text>
            <Text style={[styles.th, col.qty, styles.right]}>No. of Pax</Text>
            <Text style={[styles.th, col.units, styles.right]}>No. of Rooms</Text>
            <Text style={[styles.th, col.total, styles.right]}>Total (₹)</Text>
          </View>

          {stayDays.map((day, idx) => {
            const dayItems = itemsByDay[day] ?? [];
            if (!dayItems.length) return null;
            return (
              <View key={day}>
                <View style={styles.dayHeader} wrap={false}>
                  <Text style={styles.dayHeaderText}>DAY {idx + 1} — {fmtDate(day)}</Text>
                </View>
                {dayItems.map((li, i) => <ItemRow key={i} li={li} />)}
                <View style={styles.subtotal} wrap={false}>
                  <Text style={[styles.subtotalText, { flexGrow: 1, flexBasis: 0 }, styles.right]}>Day {idx + 1} Subtotal</Text>
                  <Text style={[styles.subtotalText, col.total, styles.right]}>{num(byDay[day] ?? 0)}</Text>
                </View>
              </View>
            );
          })}

          {multi.length > 0 && (
            <View>
              <View style={styles.dayHeader} wrap={false}>
                <Text style={styles.dayHeaderText}>MULTI-DAY / EQUIPMENT</Text>
              </View>
              {multi.map((li, i) => <ItemRow key={i} li={li} />)}
              <View style={styles.subtotal} wrap={false}>
                <Text style={[styles.subtotalText, { flexGrow: 1, flexBasis: 0 }, styles.right]}>Subtotal</Text>
                <Text style={[styles.subtotalText, col.total, styles.right]}>{num(byDay['multi'] ?? 0)}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Grand total */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.emerald, paddingVertical: 8, paddingHorizontal: 12, marginTop: 8 }} wrap={false}>
          <View>
            <Text style={{ color: colors.amberLight, fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' }}>Grand Total</Text>
            <Text style={{ color: '#fde68a', fontSize: 7.5, fontStyle: 'italic', marginTop: 2 }}>{numberToIndianWords(grandTotal)} rupees</Text>
          </View>
          <Text style={{ fontFamily: 'Cormorant Garamond', fontWeight: 700, fontSize: 20, color: colors.amberLight }}>{inr(grandTotal)}</Text>
        </View>

        {/* Notes + inclusions */}
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 14 }}>
          <View style={{ flexGrow: 1, flexBasis: 0 }}>
            <Text style={styles.sectionTitle}>Notes</Text>
            {notes.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => (
              <Text key={i} style={styles.sectionBody}>{l}</Text>
            ))}
          </View>
          <View style={{ flexGrow: 1, flexBasis: 0 }}>
            <Text style={styles.sectionTitle}>Activities Included (free)</Text>
            <Text style={styles.sectionBody}>{inclusions.join(' · ')}</Text>
          </View>
        </View>

        {/* Paid activities rate card (informational — not added to the total) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Paid Activities — Rates (payable on-site)</Text>
          {PAID_ACTIVITIES.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 }} wrap={false}>
              <Text style={{ fontSize: 8.5, color: colors.muted }}>{a.name}</Text>
              <Text style={{ fontSize: 8.5, color: colors.muted }}>{inr(a.rate)} · {a.unit}</Text>
            </View>
          ))}
        </View>

        {/* Terms */}
        {terms ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Terms & Conditions</Text>
            <Text style={styles.sectionBody}>{terms}</Text>
          </View>
        ) : null}

        <Text style={{ textAlign: 'right', fontSize: 7, color: colors.faint, marginTop: 16 }}>
          Cost sheet version {b.costSheet?.version || 1} · Prepared on {fmtDate(new Date())}
        </Text>
      </Page>
    </Document>
  );
}
