import { StyleSheet } from '@react-pdf/renderer';

// Baghaan brand palette — mirrors the colours used in the HTML print views
// (src/lib/utils/print.ts) so the PDF matches the on-screen documents.
export const colors = {
  emerald: '#064e3b',
  amber: '#d97706',
  amberLight: '#fef3c7',
  amberText: '#b45309',
  amberDeep: '#78350f',
  ink: '#1c1917',
  muted: '#57534e',
  muted2: '#78716c',
  faint: '#a8a29e',
  surface: '#f5f5f4',
  surface2: '#fafaf9',
  border: '#d6d3d1',
  borderLight: '#e7e5e4',
};

// Shared building blocks for both corporate documents. Page padding mirrors the
// HTML @page margin (~10–14mm). Body font is Lora, headings Cormorant Garamond.
export const styles = StyleSheet.create({
  page: {
    fontFamily: 'Lora',
    fontSize: 9,
    lineHeight: 1.4,
    color: colors.ink,
    paddingVertical: 28,
    paddingHorizontal: 34,
    textTransform: 'uppercase',
  },

  // Header
  header: {
    textAlign: 'center',
    borderBottomWidth: 2,
    borderBottomColor: colors.amber,
    paddingBottom: 12,
    marginBottom: 14,
  },
  brand: {
    fontFamily: 'Cormorant Garamond',
    fontWeight: 600,
    fontSize: 26,
    letterSpacing: 6,
    lineHeight: 1.3,
    color: colors.emerald,
  },
  brandSub: { fontSize: 7, letterSpacing: 4, lineHeight: 1.4, color: colors.amberText, marginTop: 2 },
  brandLine: { fontSize: 8, color: colors.muted, marginTop: 2 },

  docTitle: {
    fontFamily: 'Cormorant Garamond',
    fontWeight: 600,
    fontSize: 16,
    textAlign: 'center',
    color: colors.emerald,
    marginBottom: 4,
  },

  // Generic table
  table: { borderWidth: 1, borderColor: colors.border, marginTop: 8 },
  thead: { flexDirection: 'row', backgroundColor: colors.emerald },
  th: { color: colors.amberLight, fontSize: 8, paddingVertical: 5, paddingHorizontal: 6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.borderLight },
  td: { fontSize: 8.5, paddingVertical: 4, paddingHorizontal: 6 },
  dayHeader: {
    flexDirection: 'row',
    backgroundColor: colors.amberLight,
    borderTopWidth: 2,
    borderTopColor: colors.amber,
  },
  dayHeaderText: {
    color: colors.amberDeep,
    fontWeight: 600,
    fontSize: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    textTransform: 'uppercase',
  },
  subtotal: { flexDirection: 'row', backgroundColor: colors.surface2 },
  subtotalText: { fontSize: 8.5, fontWeight: 500, paddingVertical: 4, paddingHorizontal: 6 },

  right: { textAlign: 'right' },

  // Footer sections
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.emerald,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 3,
    marginBottom: 5,
  },
  sectionBody: { fontSize: 8.5, color: '#44403c' },

  footnote: { textAlign: 'center', fontSize: 7.5, color: colors.faint, fontStyle: 'italic', marginTop: 12 },
});
