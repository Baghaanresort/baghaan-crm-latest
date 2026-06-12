import { Document, Page, View, Text } from '@react-pdf/renderer';
import type { Booking, LineItem, ProformaInvoice } from '@/lib/types/booking';
import type { BillingEntity } from '@/lib/constants/billing';
import { fmtDate, datesInRange } from '@/lib/utils/date';
import { numberToIndianWords } from '@/lib/utils/currency';
import { registerPdfFonts } from './registerFonts';
import { styles, colors } from './theme';

registerPdfFonts();

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const num = (n: number) => (Number(n) || 0).toLocaleString('en-IN');

const col = {
  particular: { flexGrow: 3.5, flexBasis: 0 },
  rate: { flexGrow: 1.3, flexBasis: 0 },
  qty: { flexGrow: 1.4, flexBasis: 0 },
  total: { flexGrow: 1.6, flexBasis: 0 },
} as const;

export interface ProformaInvoicePdfProps {
  booking: Booking;
  pi: ProformaInvoice;
  entity: BillingEntity;
}

function PiRow({ li }: { li: LineItem }) {
  const total = (Number(li.rate) || 0) * (Number(li.qty) || 0) * (Number(li.units) || 1);
  return (
    <View style={styles.row} wrap={false}>
      <Text style={[styles.td, col.particular]}>{li.particular}</Text>
      <Text style={[styles.td, col.rate, styles.right]}>{num(li.rate)}</Text>
      <Text style={[styles.td, col.qty, styles.right]}>{li.qty}{li.units > 1 ? ` × ${li.units}` : ''}</Text>
      <Text style={[styles.td, col.total, styles.right]}>{num(total)}</Text>
    </View>
  );
}

function BankRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 1 }}>
      <Text style={{ width: '32%', color: colors.muted2, fontSize: 8.5 }}>{label}</Text>
      <Text style={{ flexGrow: 1, flexBasis: 0, fontSize: 8.5, fontFamily: mono ? 'Courier' : 'Lora' }}>{value}</Text>
    </View>
  );
}

export function ProformaInvoicePdf({ booking: b, pi, entity }: ProformaInvoicePdfProps) {
  const stayDays = datesInRange(b.arrival, b.departure);
  const ibd: Record<string, LineItem[]> = {};
  (pi.lineItems || []).forEach(li => {
    const k = li.day || 'multi';
    (ibd[k] ??= []).push(li);
  });
  const multi = ibd['multi'] ?? [];
  const balance = Math.max(0, pi.grandTotal - (pi.advanceRequired || 0));

  return (
    <Document title={`Proforma Invoice ${pi.piNumber}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>BAGHAAN</Text>
          <Text style={styles.brandSub}>ORCHARD · RETREAT</Text>
          <Text style={styles.brandLine}>{entity.address}</Text>
          <Text style={styles.brandLine}>Corporate Office: {entity.corpOffice} · GST: {entity.gst}</Text>
          <Text style={styles.brandLine}>Telephone: {entity.phones}</Text>
        </View>

        {/* Billed-to / PI meta */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          <View style={{ flexGrow: 1, flexBasis: 0 }}>
            <Text style={{ fontSize: 7, color: colors.muted2, textTransform: 'uppercase' }}>Billed To</Text>
            <Text style={{ fontSize: 9.5, fontWeight: 500, marginTop: 2 }}>{b.companyName || ''}</Text>
            {b.companyAddress ? <Text style={{ fontSize: 8.5 }}>{b.companyAddress}</Text> : null}
            {b.companyGST ? <Text style={{ fontSize: 8.5, color: colors.muted }}>GST: {b.companyGST}</Text> : null}
            <Text style={{ fontSize: 8.5, color: colors.muted, marginTop: 3 }}>
              Contact: {[b.contactName, b.contactNumber].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={{ flexGrow: 1, flexBasis: 0, textAlign: 'right' }}>
            <Text style={{ fontSize: 7, color: colors.muted2, textTransform: 'uppercase' }}>Proforma Invoice No.</Text>
            <Text style={{ fontFamily: 'Courier', fontSize: 9.5, marginTop: 2 }}>{pi.piNumber}</Text>
            <Text style={{ fontSize: 8.5, color: colors.muted, marginTop: 4 }}>Date: {fmtDate(pi.generatedAt)}</Text>
            <Text style={{ fontSize: 8.5, color: colors.muted }}>Check In: {fmtDate(b.arrival)} · 02:00 PM</Text>
            <Text style={{ fontSize: 8.5, color: colors.muted }}>Check Out: {fmtDate(b.departure)} · 11:00 AM</Text>
            <Text style={{ fontSize: 8.5, color: colors.muted }}>Nights: {b.nights}</Text>
          </View>
        </View>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.thead} fixed>
            <Text style={[styles.th, col.particular]}>Particulars</Text>
            <Text style={[styles.th, col.rate, styles.right]}>Rate</Text>
            <Text style={[styles.th, col.qty, styles.right]}>No. / Units</Text>
            <Text style={[styles.th, col.total, styles.right]}>Total (₹)</Text>
          </View>

          {stayDays.map(day => {
            const di = ibd[day] ?? [];
            if (!di.length) return null;
            return (
              <View key={day}>
                <View style={styles.dayHeader} wrap={false}>
                  <Text style={styles.dayHeaderText}>{fmtDate(day)}</Text>
                </View>
                {di.map((li, i) => <PiRow key={i} li={li} />)}
              </View>
            );
          })}

          {multi.length > 0 && (
            <View>
              <View style={styles.dayHeader} wrap={false}>
                <Text style={styles.dayHeaderText}>Multi-Day / Equipment</Text>
              </View>
              {multi.map((li, i) => <PiRow key={i} li={li} />)}
            </View>
          )}

          {/* Grand total + words */}
          <View style={{ flexDirection: 'row', backgroundColor: '#ecfdf5', borderTopWidth: 2, borderTopColor: '#047857' }} wrap={false}>
            <Text style={{ flexGrow: 1, flexBasis: 0, fontSize: 9.5, fontWeight: 500, color: '#065f46', paddingVertical: 5, paddingHorizontal: 6 }}>GRAND TOTAL</Text>
            <Text style={[col.total, styles.right, { fontSize: 9.5, fontWeight: 500, color: '#065f46', paddingVertical: 5, paddingHorizontal: 6 }]}>{inr(pi.grandTotal)}</Text>
          </View>
          <View style={styles.row} wrap={false}>
            <Text style={{ fontSize: 8.5, fontStyle: 'italic', color: colors.muted2, paddingVertical: 3, paddingHorizontal: 6 }}>Rupees {numberToIndianWords(pi.grandTotal)}</Text>
          </View>
        </View>

        {/* Payment terms */}
        <View style={{ backgroundColor: '#fffbeb', borderWidth: 2, borderColor: '#f59e0b', padding: 8, marginTop: 10 }} wrap={false}>
          <Text style={{ fontSize: 8, textTransform: 'uppercase', color: '#92400e', borderBottomWidth: 1, borderBottomColor: '#fde68a', paddingBottom: 3, marginBottom: 4 }}>Payment Terms</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 8.5 }}>Advance Required (50%)</Text>
            <Text style={{ fontSize: 8.5, fontWeight: 500 }}>{inr(pi.advanceRequired)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 8.5 }}>Balance (before checkout)</Text>
            <Text style={{ fontSize: 8.5, fontWeight: 500 }}>{inr(balance)}</Text>
          </View>
          <Text style={{ fontSize: 8.5, marginTop: 5 }}>{pi.paymentTerms || '50% advance to confirm booking. Balance to be paid before checkout.'}</Text>
        </View>

        {/* Bank details */}
        <View style={{ backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, padding: 8, marginTop: 8 }} wrap={false}>
          <Text style={{ fontSize: 8, textTransform: 'uppercase', color: colors.emerald, marginBottom: 4 }}>Bank Details</Text>
          <BankRow label="Payable to" value={entity.payeeName} />
          <BankRow label="Bank" value={entity.bank.name} />
          <BankRow label="Branch" value={entity.bank.branch} />
          <BankRow label="Account Type" value={entity.bank.accountType} />
          <BankRow label="Account No." value={entity.bank.accountNo} mono />
          <BankRow label="IFSC" value={entity.bank.ifsc} mono />
        </View>

        {/* Terms */}
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 8.5, color: colors.muted }}>1. Resort not liable for any damages due to circumstances beyond its control.</Text>
          <Text style={{ fontSize: 8.5, color: colors.muted }}>2. All disputes are subject to jurisdiction of Delhi.</Text>
          <Text style={{ fontSize: 8.5, color: colors.muted }}>{`3. Payment to be made in favour of '${entity.payeeName}'.`}</Text>
        </View>

        {/* Signature */}
        <View style={{ marginTop: 24, alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 8.5, color: colors.muted }}>Generated by: {pi.generatedBy} · {fmtDate(pi.generatedAt)}</Text>
          <Text style={{ fontSize: 8.5, marginTop: 18, borderTopWidth: 1, borderTopColor: colors.muted2, paddingTop: 3, paddingHorizontal: 24 }}>For {entity.payeeName}</Text>
          <Text style={{ fontSize: 8.5, fontStyle: 'italic', marginTop: 3 }}>Authorized Signatory</Text>
        </View>

        <Text style={styles.footnote}>**** Electronic Invoice does not require Signature ****</Text>
      </Page>
    </Document>
  );
}
