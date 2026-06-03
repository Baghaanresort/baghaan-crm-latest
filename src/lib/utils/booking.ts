import type { Booking, BookingPaymentStatus, EffectiveStatus } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';

export function getEffectiveStatus(booking: Booking, payments: Payment[]): EffectiveStatus {
  const bookingPayments = payments.filter((p) => p.bookingId === booking.id);
  const totalPaid = bookingPayments
    .filter((p) => p.verified)
    .reduce((s, p) => s + p.amount, 0);
  const totalUnverified = bookingPayments
    .filter((p) => !p.verified)
    .reduce((s, p) => s + p.amount, 0);

  if (booking.bookingType === 'corporate') {
    const stage = booking.corporateStage;
    if (stage === 'advance_paid' || stage === 'completed') return 'confirmed';
    if (stage === 'cost_sheet_accepted' || stage === 'pi_generated') {
      if (totalPaid > 0) return 'confirmed';
      if (totalUnverified > 0) return 'pending_verification';
      return 'hold';
    }
    return 'hold';
  }

  if (booking.status === 'confirmed') return 'confirmed';
  if (totalPaid > 0) return 'confirmed';
  if (totalUnverified > 0) return 'pending_verification';
  return 'hold';
}

export function getBookingPaymentStatus(
  booking: Booking,
  payments: Payment[]
): BookingPaymentStatus {
  const bookingPayments = payments.filter((p) => p.bookingId === booking.id);
  const verifiedPayments = bookingPayments.filter((p) => p.verified);
  const totalPaid = verifiedPayments.reduce((s, p) => s + p.amount, 0);
  const totalUnverified = bookingPayments
    .filter((p) => !p.verified)
    .reduce((s, p) => s + p.amount, 0);
  const hasFinalBill =
    !!booking.finalBill && Number(booking.finalBill.totalAmount ?? 0) > 0;
  const billAmount = hasFinalBill
    ? booking.finalBill!.totalAmount
    : booking.totalAmount;
  const balance = billAmount - totalPaid;
  const advanceRequired = booking.proformaInvoice?.advanceRequired ?? 0;
  const advanceShortfall = Math.max(0, advanceRequired - totalPaid);
  return {
    totalPaid,
    totalUnverified,
    billAmount,
    balance,
    hasFinalBill,
    advanceRequired,
    advanceShortfall,
  };
}

export function generateConfirmationNumber(counter: number): string {
  const initials = 'HO';
  const yr = String(new Date().getFullYear()).slice(-2);
  return `BOR/${initials}/${yr}/${String(counter).padStart(3, '0')}`;
}
