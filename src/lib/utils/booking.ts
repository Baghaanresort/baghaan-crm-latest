import type { Booking, BookingPaymentStatus, EffectiveStatus } from '@/lib/types/booking';
import type { Payment } from '@/lib/types/payment';

export function getEffectiveStatus(booking: Booking, payments: Payment[]): EffectiveStatus {
  // Refunds are outgoing money — never count them as "paid" toward a reservation.
  const bookingPayments = payments.filter((p) => p.bookingId === booking.id && p.type !== 'refund');
  const totalPaid = bookingPayments
    .filter((p) => p.verified)
    .reduce((s, p) => s + p.amount, 0);
  const totalUnverified = bookingPayments
    .filter((p) => !p.verified)
    .reduce((s, p) => s + p.amount, 0);

  if (booking.bookingType === 'corporate') {
    const stage = booking.corporateStage;
    // Advance paid onward = a real, room-consuming reservation.
    if (stage === 'advance_paid' || stage === 'confirmed' || stage === 'checked_in' || stage === 'completed') return 'confirmed';
    if (stage === 'cost_sheet_accepted' || stage === 'pi_generated') {
      if (totalPaid > 0) return 'confirmed';
      if (totalUnverified > 0) return 'pending_verification';
      return 'hold';
    }
    return 'hold';
  }

  // A checked-in / checked-out guest is unambiguously a real reservation.
  if (booking.status === 'confirmed' || booking.status === 'checked_in' || booking.status === 'checked_out') return 'confirmed';
  if (totalPaid > 0) return 'confirmed';
  if (totalUnverified > 0) return 'pending_verification';
  return 'hold';
}

export function getBookingPaymentStatus(
  booking: Booking,
  payments: Payment[]
): BookingPaymentStatus {
  const allForBooking = payments.filter((p) => p.bookingId === booking.id);
  // Incoming payments drive paid/balance; refunds are tracked separately as outflow.
  const bookingPayments = allForBooking.filter((p) => p.type !== 'refund');
  const verifiedPayments = bookingPayments.filter((p) => p.verified);
  const totalPaid = verifiedPayments.reduce((s, p) => s + p.amount, 0);
  const totalUnverified = bookingPayments
    .filter((p) => !p.verified)
    .reduce((s, p) => s + p.amount, 0);
  const totalRefunded = allForBooking
    .filter((p) => p.type === 'refund' && p.refundStatus === 'done')
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
    totalRefunded,
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
