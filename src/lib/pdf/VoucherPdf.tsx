import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { Booking } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';
import { fmtDate } from '@/lib/utils/date';
import { getRoomCategory } from '@/lib/constants/rooms';
import { registerPdfFonts } from './registerFonts';
import { styles as base, colors } from './theme';

registerPdfFonts();

const inr = (n: number) => `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const s = StyleSheet.create({
  greeting: { fontSize: 9, marginTop: 6, marginBottom: 2 },
  box: { borderWidth: 1, borderColor: colors.borderLight, marginTop: 6 },
  kvRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  kCell: { width: '34%', backgroundColor: colors.surface, padding: 6, fontSize: 8.5, fontWeight: 500, color: '#44403c' },
  vCell: { width: '66%', padding: 6, fontSize: 8.5 },
  h3: { backgroundColor: colors.emerald, color: colors.amberLight, fontSize: 8.5, letterSpacing: 1.5, textTransform: 'uppercase', paddingVertical: 5, paddingHorizontal: 10, marginTop: 12, fontWeight: 500 },
  holdBanner: { backgroundColor: colors.amberLight, borderWidth: 2, borderColor: colors.amber, color: colors.amberDeep, padding: 8, marginBottom: 12, textAlign: 'center', fontSize: 8.5, letterSpacing: 1 },
  closing: { textAlign: 'center', fontFamily: 'Lora', fontSize: 12, color: '#065f46', fontStyle: 'italic', marginVertical: 16 },
  txnRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f0efed' },
  txnTh: { backgroundColor: colors.surface, fontSize: 7.5, textTransform: 'uppercase', padding: 4, color: '#44403c' },
  txnTd: { fontSize: 8, padding: 4 },
});

function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.kvRow}>
      <Text style={s.kCell}>{label}</Text>
      <Text style={s.vCell}>{value}</Text>
    </View>
  );
}

export interface VoucherPdfProps {
  booking: Booking;
  payments?: Payment[];
}

export function VoucherPdf({ booking: b, payments = [] }: VoucherPdfProps) {
  const roomGroups: Record<string, number> = {};
  (b.rooms || []).forEach((r) => { const c = String(getRoomCategory(r)); roomGroups[c] = (roomGroups[c] ?? 0) + 1; });
  const roomsLine = Object.entries(roomGroups).map(([c, ct]) => `${String(ct).padStart(2, '0')} ${c}`).join(', ') || '—';

  const hasPayments = payments.length > 0;
  const received = hasPayments
    ? payments.reduce((su, p) => su + (p.type === 'refund' ? -p.amount : p.amount), 0)
    : (b.advancePaid || 0);
  const balance = Math.max(0, (b.totalAmount || 0) - received);
  const inclusions = (b.inclusions || '').split('\n').map((x) => x.trim()).filter(Boolean);

  return (
    <Document>
      <Page size="A4" style={base.page}>
        {b.status === 'hold' && (
          <Text style={s.holdBanner}>PROVISIONAL HOLD VOUCHER — Rooms blocked pending payment{b.holdExpiresAt ? `. Confirm by ${fmtDate(b.holdExpiresAt)}` : ''}.</Text>
        )}

        <View style={base.header}>
          <Text style={base.brand}>BAGHAAN</Text>
          <Text style={base.brandSub}>ORCHARD · RETREAT</Text>
          <Text style={base.brandLine}>Village - Kachrot, Garhmukteshwar, Uttar Pradesh</Text>
          <Text style={base.brandLine}>Telephone: 07599053402, 09410083460</Text>
        </View>
        <Text style={base.docTitle}>Booking Voucher</Text>
        <Text style={s.greeting}>Dear Guest,</Text>
        <Text style={s.greeting}>Thank you for choosing Baghaan Orchard Retreat. We are pleased to confirm your reservation as follows.</Text>

        <View style={s.box}>
          <KV label="Confirmation Number" value={b.confirmationNumber} />
          <KV label="Arrival Date" value={fmtDate(b.arrival)} />
          <KV label="Departure Date" value={fmtDate(b.departure)} />
          <KV label="Number of Nights" value={`${b.nights} ${b.nights === 1 ? 'night' : 'nights'}`} />
          <KV label="No. of Adults / Child" value={`${b.adults} ${b.adults === 1 ? 'Adult' : 'Adults'}${b.children > 0 ? ` + ${b.children} ${b.children === 1 ? 'Child' : 'Children'} (up to 12 yrs)` : ''}`} />
          {b.rateBreakdown ? <KV label="Payment Breakup" value={b.rateBreakdown} /> : null}
        </View>

        <Text style={s.h3}>Guest Details</Text>
        <View style={s.box}>
          <KV label="Contact Name" value={b.guestName} />
          <KV label="Contact Number" value={b.contactNumber} />
          {b.email ? <KV label="Email" value={b.email} /> : null}
          {b.companyName ? <KV label="Company" value={b.companyName} /> : null}
          {b.gstNumber ? <KV label="GST Number" value={b.gstNumber} /> : null}
        </View>

        <Text style={s.h3}>Rate Information</Text>
        <View style={s.box}>
          <KV label="Rooms" value={roomsLine} />
          <KV label="Total Package Amount" value={inr(b.totalAmount || 0)} />
          <KV label="Received" value={inr(received)} />
          <KV label="Balance Due" value={inr(balance)} />
        </View>

        {inclusions.length > 0 && (
          <>
            <Text style={s.h3}>Inclusions</Text>
            <View style={{ padding: 6 }}>
              {inclusions.map((l, i) => (
                <View key={i} style={{ flexDirection: 'row', marginBottom: 1.5 }}>
                  <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.emerald, marginTop: 4, marginRight: 6 }} />
                  <Text style={{ fontSize: 8.5, flexGrow: 1, flexBasis: 0 }}>{l}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {hasPayments && (
          <>
            <Text style={s.h3}>Payments Received</Text>
            <View style={s.box}>
              <View style={s.txnRow}>
                <Text style={[s.txnTh, { flexGrow: 1.2, flexBasis: 0 }]}>Date</Text>
                <Text style={[s.txnTh, { flexGrow: 1.6, flexBasis: 0 }]}>Type / Mode</Text>
                <Text style={[s.txnTh, { flexGrow: 1, flexBasis: 0, textAlign: 'right' }]}>Amount (Rs.)</Text>
              </View>
              {payments.map((p, i) => (
                <View key={i} style={s.txnRow}>
                  <Text style={[s.txnTd, { flexGrow: 1.2, flexBasis: 0 }]}>{fmtDate(p.paymentDate)}</Text>
                  <Text style={[s.txnTd, { flexGrow: 1.6, flexBasis: 0 }]}>{`${p.type === 'refund' ? 'Refund' : 'Payment'}${p.mode ? ` · ${p.mode}` : ''}`}</Text>
                  <Text style={[s.txnTd, { flexGrow: 1, flexBasis: 0, textAlign: 'right' }]}>{`${p.type === 'refund' ? '-' : ''}${Number(p.amount).toLocaleString('en-IN')}`}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={s.closing}>We look forward to welcoming you.</Text>
        <Text style={base.footnote}>{`Voucher ${b.confirmationNumber} · Generated ${fmtDate(new Date())} · Baghaan Orchard Retreat`}</Text>
      </Page>
    </Document>
  );
}
